# Flutter Integration Guide

> How to consume the **MockApp API** from a Flutter mobile app using
> **Clean Architecture + Repository Pattern + Bloc + Dio**.
>
> This guide is opinionated. It mirrors the response envelope defined in `00-overview.md`
> and gives ready-to-paste Dart snippets that work with the OpenAPI spec.

---

## 1. Recommended Folder Structure

Organize **by feature**, then **by layer**. Each feature is independently testable.

```
lib/
├── core/                                  # Cross-feature plumbing
│   ├── constants/
│   │   ├── api_endpoints.dart             # const String registry of all paths
│   │   └── app_constants.dart
│   ├── di/
│   │   └── injection.dart                 # get_it / injectable wiring
│   ├── error/
│   │   ├── error_codes.dart               # mirrors server `error_code` enum
│   │   ├── exceptions.dart                # raw exceptions thrown by data layer
│   │   └── failure.dart                   # sealed class consumed by Bloc / UI
│   ├── network/
│   │   ├── dio_client.dart                # Dio singleton with base options
│   │   ├── api_response.dart              # ApiResponse<T> generic envelope
│   │   ├── pagination.dart                # PaginationMeta + Page<T>
│   │   └── interceptors/
│   │       ├── auth_interceptor.dart      # Attach Bearer token
│   │       ├── refresh_interceptor.dart   # Refresh on 401 AUTH_TOKEN_EXPIRED
│   │       ├── error_interceptor.dart     # Map DioException → Failure
│   │       ├── logging_interceptor.dart   # PrettyDioLogger in debug
│   │       └── headers_interceptor.dart   # X-App-Version, X-App-Platform, X-Request-Id
│   ├── routing/
│   │   └── app_router.dart                # go_router config
│   ├── storage/
│   │   ├── secure_storage.dart            # flutter_secure_storage (tokens)
│   │   └── prefs_storage.dart             # SharedPreferences (non-secrets)
│   ├── theme/
│   ├── utils/
│   │   ├── result.dart                    # Result<T, F> = Either<F, T>
│   │   └── date_formatter.dart
│   └── widgets/                           # Reusable widgets (loading, error, empty)
│
├── features/
│   ├── auth/
│   │   ├── data/
│   │   │   ├── datasources/
│   │   │   │   ├── auth_remote_datasource.dart   # Dio calls
│   │   │   │   └── auth_local_datasource.dart    # Secure storage
│   │   │   ├── models/
│   │   │   │   ├── user_model.dart        # json_serializable, snake_case
│   │   │   │   ├── login_request.dart
│   │   │   │   ├── register_request.dart
│   │   │   │   ├── token_pair_model.dart
│   │   │   │   └── auth_response_model.dart
│   │   │   └── repositories/
│   │   │       └── auth_repository_impl.dart     # Implements domain contract
│   │   ├── domain/
│   │   │   ├── entities/
│   │   │   │   ├── user.dart              # Plain Dart (no JSON)
│   │   │   │   └── token_pair.dart
│   │   │   ├── repositories/
│   │   │   │   └── auth_repository.dart   # ABSTRACT — domain contract
│   │   │   └── usecases/
│   │   │       ├── login_usecase.dart
│   │   │       ├── register_usecase.dart
│   │   │       ├── logout_usecase.dart
│   │   │       ├── refresh_token_usecase.dart
│   │   │       └── get_current_user_usecase.dart
│   │   └── presentation/
│   │       ├── bloc/
│   │       │   ├── auth_bloc.dart
│   │       │   ├── auth_event.dart
│   │       │   └── auth_state.dart
│   │       ├── pages/
│   │       │   ├── login_page.dart
│   │       │   ├── register_page.dart
│   │       │   └── splash_page.dart
│   │       └── widgets/
│   │
│   ├── products/                          # Same data/domain/presentation split
│   ├── notifications/
│   ├── chat/                              # Includes WebSocket service
│   ├── profile/
│   └── home/
│
├── config/
│   ├── env/
│   │   ├── env.dart                       # Abstract Env
│   │   ├── env.dev.dart                   # dev (Mockoon)
│   │   ├── env.staging.dart               # hosted mock
│   │   └── env.prod.dart
│   └── flavor.dart
│
├── app.dart                               # MaterialApp / MultiBlocProvider root
└── main.dart                              # Bootstrap (flavor + DI + runApp)
```

### Layer responsibilities

| Layer | Knows about | Does NOT know about |
|---|---|---|
| **Presentation** (UI + Bloc) | Use cases, entities, failures | Dio, JSON, storage |
| **Domain** (entities + repository contracts + use cases) | Nothing external — pure Dart | Flutter, JSON, HTTP |
| **Data** (data sources + models + repository impl) | Dio, JSON, secure storage, entities | Flutter widgets, Bloc |

**Dependency rule:** presentation → domain ← data. Domain never imports data or presentation.

---

## 2. Environment & Base URL

`config/env/env.dart`:

```dart
abstract class Env {
  String get apiBaseUrl;
  String get wsBaseUrl;
  Duration get connectTimeout;
  Duration get receiveTimeout;
  Duration get sendTimeout;
  bool get enableLogging;
  String get appVersion;
}
```

`config/env/env.dev.dart` — points at the local Next.js mock or Mockoon:

```dart
class DevEnv implements Env {
  @override final apiBaseUrl   = 'http://10.0.2.2:3000/api';      // Android emulator → host
  @override final wsBaseUrl    = 'http://10.0.2.2:3000';
  @override final connectTimeout = const Duration(seconds: 10);
  @override final receiveTimeout = const Duration(seconds: 15);
  @override final sendTimeout    = const Duration(seconds: 15);
  @override final enableLogging  = true;
  @override final appVersion     = '2.0.0';
}
```

> **iOS simulator** can use `http://localhost:3000/api`.
> **Android emulator** must use `http://10.0.2.2:3000/api` (special host alias).
> **Physical device** uses your Mac's LAN IP (`http://192.168.x.x:3000/api`).

---

## 3. The Dio Client

`core/network/dio_client.dart`:

```dart
class DioClient {
  final Dio dio;

  DioClient(Env env, AuthLocalDataSource auth, RefreshTokenUseCase refresh)
      : dio = Dio(BaseOptions(
          baseUrl: env.apiBaseUrl,
          connectTimeout: env.connectTimeout,
          receiveTimeout: env.receiveTimeout,
          sendTimeout: env.sendTimeout,
          contentType: Headers.jsonContentType,
          responseType: ResponseType.json,
          validateStatus: (code) => code != null && code < 500,
          headers: {
            'Accept': 'application/json',
            'Accept-Language': 'id-ID',
          },
        )) {
    dio.interceptors.addAll([
      HeadersInterceptor(env: env),
      AuthInterceptor(auth: auth),
      RefreshInterceptor(auth: auth, refresh: refresh, dio: dio),
      ErrorInterceptor(),
      if (env.enableLogging) PrettyDioLogger(requestBody: true, responseBody: true),
    ]);
  }
}
```

> `validateStatus: (code) => code < 500` lets us handle 4xx in `onResponse` instead of `onError`,
> which makes Bloc dispatch logic linear and avoids try/catch around every call.

---

## 4. Interceptor Chain

### 4.1 Headers Interceptor

Inject `X-App-Version`, `X-App-Platform`, `X-Request-Id`, and `Accept-Language`:

```dart
class HeadersInterceptor extends Interceptor {
  HeadersInterceptor({required this.env});
  final Env env;

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    options.headers['X-App-Version']  = env.appVersion;
    options.headers['X-App-Platform'] = Platform.isIOS ? 'ios' : 'android';
    options.headers['X-Request-Id']   = const Uuid().v4();
    return handler.next(options);
  }
}
```

### 4.2 Auth Interceptor

Attach the access token. Skip for endpoints marked public:

```dart
class AuthInterceptor extends Interceptor {
  AuthInterceptor({required this.auth});
  final AuthLocalDataSource auth;

  static const _publicPaths = {
    '/auth/login', '/auth/register', '/auth/refresh',
    '/products', '/products/{id}', '/health', '/config',
    '/config/force-update', '/config/maintenance',
  };

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    if (_isPublic(options.path)) return handler.next(options);

    final token = await auth.readAccessToken();
    if (token != null) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    return handler.next(options);
  }

  bool _isPublic(String path) => _publicPaths.any((p) => _match(p, path));
  bool _match(String pattern, String path) {
    final regex = RegExp('^' + pattern.replaceAll(RegExp(r'\{[^/]+\}'), '[^/]+') + r'$');
    return regex.hasMatch(path);
  }
}
```

### 4.3 Refresh Interceptor

The critical one. On `401 AUTH_TOKEN_EXPIRED`, refresh **once** (queue concurrent calls) and retry:

```dart
class RefreshInterceptor extends QueuedInterceptor {
  RefreshInterceptor({required this.auth, required this.refresh, required this.dio});
  final AuthLocalDataSource auth;
  final RefreshTokenUseCase refresh;
  final Dio dio;

  bool _refreshing = false;

  @override
  Future<void> onResponse(Response response, ResponseInterceptorHandler handler) async {
    final body = response.data;
    final isError = body is Map && body['success'] == false;
    final errorCode = isError ? body['error_code'] as String? : null;

    if (response.statusCode == 401 && errorCode == 'AUTH_TOKEN_EXPIRED') {
      try {
        if (!_refreshing) {
          _refreshing = true;
          await refresh.call();
          _refreshing = false;
        }
        final retryResponse = await _retry(response.requestOptions);
        return handler.resolve(retryResponse);
      } on Exception {
        await auth.clearTokens();
        return handler.next(response); // surface as auth failure
      }
    }

    if (response.statusCode == 401 &&
        (errorCode == 'AUTH_REFRESH_TOKEN_INVALID' ||
         errorCode == 'AUTH_TOKEN_INVALID')) {
      await auth.clearTokens();
    }

    return handler.next(response);
  }

  Future<Response> _retry(RequestOptions req) {
    final token = await auth.readAccessToken();
    final opts = Options(method: req.method, headers: {
      ...req.headers,
      'Authorization': 'Bearer $token',
    });
    return dio.request(req.path, options: opts, data: req.data, queryParameters: req.queryParameters);
  }
}
```

> **Why `QueuedInterceptor`?** If 5 calls fire concurrently and all get 401, we only want
> ONE refresh call — the rest queue and retry with the new token.

### 4.4 Error Interceptor

Map the server envelope and `DioException` into a `Failure` sealed class:

```dart
class ErrorInterceptor extends Interceptor {
  @override
  void onResponse(Response response, ResponseInterceptorHandler handler) {
    final body = response.data;
    if (body is Map && body['success'] == false) {
      final failure = _toFailure(response.statusCode, body);
      return handler.reject(
        DioException(
          requestOptions: response.requestOptions,
          response: response,
          type: DioExceptionType.badResponse,
          error: failure,
        ),
      );
    }
    return handler.next(response);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    if (err.error is Failure) return handler.next(err); // already mapped above

    final failure = switch (err.type) {
      DioExceptionType.connectionTimeout ||
      DioExceptionType.sendTimeout ||
      DioExceptionType.receiveTimeout    => const NetworkFailure.timeout(),
      DioExceptionType.connectionError   => const NetworkFailure.noConnection(),
      DioExceptionType.cancel            => const NetworkFailure.cancelled(),
      _                                  => const ServerFailure.unknown(),
    };
    handler.next(err.copyWith(error: failure));
  }

  Failure _toFailure(int? status, Map body) {
    final code = body['error_code'] as String? ?? 'INTERNAL_SERVER_ERROR';
    final message = body['message'] as String? ?? 'Something went wrong.';
    final errors = (body['errors'] as Map?)?.map(
      (k, v) => MapEntry(k as String, (v as List).cast<String>()),
    );
    final requestId = body['request_id'] as String?;

    return switch (code) {
      'VALIDATION_ERROR'             => ValidationFailure(message: message, fieldErrors: errors ?? {}),
      'AUTH_INVALID_CREDENTIALS'     => AuthFailure.invalidCredentials(message),
      'AUTH_TOKEN_EXPIRED'           => AuthFailure.tokenExpired(message),
      'AUTH_REFRESH_TOKEN_INVALID'   => AuthFailure.sessionExpired(message),
      'AUTH_ACCOUNT_DISABLED'        => AuthFailure.accountDisabled(message),
      'AUTHORIZATION_FORBIDDEN'      => PermissionFailure(message),
      'RESOURCE_NOT_FOUND'           => NotFoundFailure(message),
      'RESOURCE_ALREADY_EXISTS'      => ConflictFailure(message),
      'RATE_LIMIT_EXCEEDED'          => RateLimitFailure(message),
      'MAINTENANCE_MODE'             => MaintenanceFailure(message),
      'FORCE_UPDATE_REQUIRED'        => ForceUpdateFailure(message),
      _                              => ServerFailure(code: code, message: message, requestId: requestId),
    };
  }
}
```

---

## 5. The Failure Sealed Class

`core/error/failure.dart`:

```dart
sealed class Failure {
  const Failure({required this.message, this.requestId});
  final String message;
  final String? requestId;
}

class ValidationFailure extends Failure {
  const ValidationFailure({required super.message, required this.fieldErrors});
  final Map<String, List<String>> fieldErrors;
}

sealed class AuthFailure extends Failure {
  const AuthFailure({required super.message});
  const factory AuthFailure.invalidCredentials(String m) = _InvalidCredentials;
  const factory AuthFailure.tokenExpired(String m)       = _TokenExpired;
  const factory AuthFailure.sessionExpired(String m)     = _SessionExpired;
  const factory AuthFailure.accountDisabled(String m)    = _AccountDisabled;
}
class _InvalidCredentials extends AuthFailure { const _InvalidCredentials(String m) : super(message: m); }
class _TokenExpired       extends AuthFailure { const _TokenExpired(String m)       : super(message: m); }
class _SessionExpired     extends AuthFailure { const _SessionExpired(String m)     : super(message: m); }
class _AccountDisabled    extends AuthFailure { const _AccountDisabled(String m)    : super(message: m); }

class PermissionFailure  extends Failure { const PermissionFailure(String m) : super(message: m); }
class NotFoundFailure    extends Failure { const NotFoundFailure(String m) : super(message: m); }
class ConflictFailure    extends Failure { const ConflictFailure(String m) : super(message: m); }
class RateLimitFailure   extends Failure { const RateLimitFailure(String m) : super(message: m); }
class MaintenanceFailure extends Failure { const MaintenanceFailure(String m) : super(message: m); }
class ForceUpdateFailure extends Failure { const ForceUpdateFailure(String m) : super(message: m); }

sealed class NetworkFailure extends Failure {
  const NetworkFailure({required super.message});
  const factory NetworkFailure.timeout()      = _Timeout;
  const factory NetworkFailure.noConnection() = _NoConnection;
  const factory NetworkFailure.cancelled()    = _Cancelled;
}
class _Timeout      extends NetworkFailure { const _Timeout()      : super(message: 'The request timed out.'); }
class _NoConnection extends NetworkFailure { const _NoConnection() : super(message: 'No internet connection.'); }
class _Cancelled    extends NetworkFailure { const _Cancelled()    : super(message: 'Request cancelled.'); }

class ServerFailure extends Failure {
  const ServerFailure({this.code = 'INTERNAL_SERVER_ERROR', required super.message, super.requestId});
  const ServerFailure.unknown() : this(message: 'Something went wrong.');
  final String code;
}
```

Bloc pattern-matches on this sealed family — exhaustive at compile time:

```dart
emit(switch (failure) {
  ValidationFailure(:final fieldErrors) => state.copyWith(formErrors: fieldErrors),
  AuthFailure()                         => state.copyWith(status: AuthStatus.unauthenticated),
  NetworkFailure()                      => state.copyWith(banner: failure.message),
  _                                     => state.copyWith(error: failure.message),
});
```

---

## 6. ApiResponse Envelope (Generic)

`core/network/api_response.dart`:

```dart
class ApiResponse<T> {
  const ApiResponse({required this.success, required this.message, this.data, this.meta});

  factory ApiResponse.fromJson(Map<String, dynamic> json, T Function(Object?) fromJsonT) =>
      ApiResponse(
        success: json['success'] as bool,
        message: json['message'] as String,
        data: json['data'] == null ? null : fromJsonT(json['data']),
        meta: json['meta'] == null
            ? null
            : PaginationMeta.fromJson(json['meta'] as Map<String, dynamic>),
      );

  final bool success;
  final String message;
  final T? data;
  final PaginationMeta? meta;
}

class PaginationMeta {
  const PaginationMeta({required this.page, required this.limit, required this.total,
      required this.totalPages, required this.hasNext, required this.hasPrev});

  factory PaginationMeta.fromJson(Map<String, dynamic> json) => PaginationMeta(
        page: json['page'] as int,
        limit: json['limit'] as int,
        total: json['total'] as int,
        totalPages: json['total_pages'] as int,
        hasNext: json['has_next'] as bool,
        hasPrev: json['has_prev'] as bool,
      );

  final int page;
  final int limit;
  final int total;
  final int totalPages;
  final bool hasNext;
  final bool hasPrev;
}

class Page<T> {
  const Page({required this.items, required this.meta});
  final List<T> items;
  final PaginationMeta meta;
}
```

---

## 7. Feature Walk-Through: Auth

### 7.1 Domain entity

`features/auth/domain/entities/user.dart`:

```dart
class User {
  const User({required this.id, required this.name, required this.email,
      this.phone, this.avatarUrl, required this.role, required this.isActive,
      required this.createdAt});
  final String id;
  final String name;
  final String email;
  final String? phone;
  final String? avatarUrl;
  final UserRole role;
  final bool isActive;
  final DateTime createdAt;
}
enum UserRole { user, admin }
```

### 7.2 Domain repository (contract)

`features/auth/domain/repositories/auth_repository.dart`:

```dart
abstract interface class AuthRepository {
  Future<Result<TokenPair, Failure>> login({required String email, required String password});
  Future<Result<TokenPair, Failure>> register({required String name, required String email, required String password, String? phone});
  Future<Result<TokenPair, Failure>> refresh();
  Future<Result<void, Failure>>      logout();
  Future<Result<User, Failure>>      getCurrentUser();
}
```

`Result<T, F>` is your `Either` from `dartz`, `fpdart`, or hand-rolled.

### 7.3 Data model with `json_serializable`

`features/auth/data/models/user_model.dart`:

```dart
@JsonSerializable()
class UserModel {
  const UserModel({required this.id, required this.name, required this.email,
      this.phone, @JsonKey(name: 'avatar_url') this.avatarUrl,
      required this.role, @JsonKey(name: 'is_active') required this.isActive,
      @JsonKey(name: 'created_at') required this.createdAt,
      @JsonKey(name: 'updated_at') required this.updatedAt});

  final String id;
  final String name;
  final String email;
  final String? phone;
  final String? avatarUrl;
  final String role;
  final bool isActive;
  final DateTime createdAt;
  final DateTime updatedAt;

  factory UserModel.fromJson(Map<String, dynamic> json) => _$UserModelFromJson(json);
  Map<String, dynamic> toJson() => _$UserModelToJson(this);

  User toEntity() => User(
        id: id, name: name, email: email, phone: phone, avatarUrl: avatarUrl,
        role: role == 'admin' ? UserRole.admin : UserRole.user,
        isActive: isActive, createdAt: createdAt,
      );
}
```

### 7.4 Remote data source

```dart
class AuthRemoteDataSource {
  AuthRemoteDataSource(this._dio);
  final Dio _dio;

  Future<AuthResponseModel> login(String email, String password) async {
    final res = await _dio.post('/auth/login', data: {'email': email, 'password': password});
    return AuthResponseModel.fromJson(res.data['data'] as Map<String, dynamic>);
  }

  Future<AuthResponseModel> refresh(String refreshToken) async {
    final res = await _dio.post('/auth/refresh', data: {'refresh_token': refreshToken});
    return AuthResponseModel.fromJson(res.data['data'] as Map<String, dynamic>);
  }

  Future<UserModel> me() async {
    final res = await _dio.get('/auth/me');
    return UserModel.fromJson(res.data['data'] as Map<String, dynamic>);
  }
}
```

> Note we read `res.data['data']` — the envelope is unwrapped here so the rest of
> the app never sees `{success, message, …}` wrappers.

### 7.5 Repository implementation

```dart
class AuthRepositoryImpl implements AuthRepository {
  AuthRepositoryImpl(this._remote, this._local);
  final AuthRemoteDataSource _remote;
  final AuthLocalDataSource _local;

  @override
  Future<Result<TokenPair, Failure>> login({required String email, required String password}) async {
    try {
      final response = await _remote.login(email, password);
      await _local.saveTokens(response.tokenPair);
      return Result.ok(response.tokenPair);
    } on DioException catch (e) {
      return Result.err(e.error is Failure ? e.error as Failure : const ServerFailure.unknown());
    }
  }
  // … same shape for register, refresh, logout, getCurrentUser
}
```

### 7.6 Bloc

```dart
sealed class AuthEvent { const AuthEvent(); }
class AuthLoginRequested extends AuthEvent { const AuthLoginRequested({required this.email, required this.password}); final String email; final String password; }
class AuthLogoutRequested extends AuthEvent {}
class AuthBootstrapRequested extends AuthEvent {}

class AuthState {
  const AuthState({required this.status, this.user, this.formErrors = const {}, this.errorMessage});
  final AuthStatus status;
  final User? user;
  final Map<String, List<String>> formErrors;
  final String? errorMessage;

  AuthState copyWith({AuthStatus? status, User? user, Map<String, List<String>>? formErrors, String? errorMessage}) =>
      AuthState(status: status ?? this.status, user: user ?? this.user,
                formErrors: formErrors ?? this.formErrors, errorMessage: errorMessage);
}
enum AuthStatus { unknown, authenticated, unauthenticated, authenticating }

class AuthBloc extends Bloc<AuthEvent, AuthState> {
  AuthBloc(this._login, this._logout, this._getCurrentUser) : super(const AuthState(status: AuthStatus.unknown)) {
    on<AuthLoginRequested>(_onLogin);
    on<AuthLogoutRequested>(_onLogout);
    on<AuthBootstrapRequested>(_onBootstrap);
  }

  final LoginUseCase _login;
  final LogoutUseCase _logout;
  final GetCurrentUserUseCase _getCurrentUser;

  Future<void> _onLogin(AuthLoginRequested e, Emitter<AuthState> emit) async {
    emit(state.copyWith(status: AuthStatus.authenticating, formErrors: const {}, errorMessage: null));
    final result = await _login(email: e.email, password: e.password);
    emit(result.fold(
      onErr: (f) => switch (f) {
        ValidationFailure(:final fieldErrors) =>
            state.copyWith(status: AuthStatus.unauthenticated, formErrors: fieldErrors),
        _ => state.copyWith(status: AuthStatus.unauthenticated, errorMessage: f.message),
      },
      onOk: (_) => state.copyWith(status: AuthStatus.authenticated, formErrors: const {}),
    ));
  }
}
```

---

## 8. Pagination Pattern

A generic paginated Bloc keeps your list pages DRY:

```dart
class PaginatedState<T> extends Equatable {
  const PaginatedState({
    this.items = const [],
    this.page = 1,
    this.hasMore = true,
    this.status = PaginatedStatus.idle,
    this.error,
  });
  final List<T> items;
  final int page;
  final bool hasMore;
  final PaginatedStatus status;
  final String? error;

  PaginatedState<T> copyWith({...}) => /* … */;

  @override List<Object?> get props => [items, page, hasMore, status, error];
}

enum PaginatedStatus { idle, loading, loadingMore, refreshing, error }

abstract class PaginatedBloc<E, T> extends Bloc<E, PaginatedState<T>> {
  PaginatedBloc() : super(PaginatedState<T>());

  Future<Page<T>> fetchPage(int page);

  Future<void> loadNext(Emitter<PaginatedState<T>> emit) async {
    if (state.status == PaginatedStatus.loadingMore || !state.hasMore) return;
    emit(state.copyWith(status: PaginatedStatus.loadingMore));
    try {
      final page = await fetchPage(state.page);
      emit(state.copyWith(
        items: [...state.items, ...page.items],
        page: state.page + 1,
        hasMore: page.meta.hasNext,
        status: PaginatedStatus.idle,
      ));
    } on Failure catch (f) {
      emit(state.copyWith(status: PaginatedStatus.error, error: f.message));
    }
  }
}
```

UI side, on `ListView.builder`:

```dart
NotificationListener<ScrollNotification>(
  onNotification: (n) {
    if (n.metrics.pixels >= n.metrics.maxScrollExtent - 200) {
      context.read<ProductsBloc>().add(ProductsLoadMore());
    }
    return false;
  },
  child: ListView.separated(/* … */),
);
```

---

## 9. WebSocket Integration

Use `socket_io_client` 2.x.

`features/chat/data/datasources/chat_socket_service.dart`:

```dart
class ChatSocketService {
  ChatSocketService(this._env, this._auth);
  final Env _env;
  final AuthLocalDataSource _auth;
  late final IO.Socket _socket;

  Future<void> connect() async {
    final token = await _auth.readAccessToken();
    _socket = IO.io(
      _env.wsBaseUrl,
      IO.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': token})
          .disableAutoConnect()
          .build(),
    );
    _socket.connect();

    _socket.onConnect((_)        => log('🟢 ws connected'));
    _socket.onDisconnect((_)     => log('🔴 ws disconnected'));
    _socket.onConnectError((e)   => log('ws connect error: $e'));
    _socket.on('notification:new', _onNotification);
    _socket.on('chat:message',     _onChatMessage);
  }

  Stream<ChatMessage> get messages$ => _msgController.stream;
  final _msgController = StreamController<ChatMessage>.broadcast();
  void _onChatMessage(dynamic data) =>
      _msgController.add(ChatMessage.fromJson(data as Map<String, dynamic>));

  void joinRoom(String roomId)               => _socket.emit('chat:join',  {'room_id': roomId});
  void leaveRoom(String roomId)              => _socket.emit('chat:leave', {'room_id': roomId});
  void send(String roomId, String content)   => _socket.emit('chat:send',  {'room_id': roomId, 'content': content, 'type': 'text'});
  void typing(String roomId, bool isTyping)  => _socket.emit('chat:typing',{'room_id': roomId, 'is_typing': isTyping});

  Future<void> disconnect() async {
    await _msgController.close();
    _socket.disconnect();
  }
}
```

Connect on login, disconnect on logout. Wire token refresh: on reconnect attempts after
401 expiry, the access token may be stale — refresh first, then reconnect.

---

## 10. Mocking with Mockoon

1. Open Mockoon → **Open environment** → select `mockoon-environment.json` from this repo.
2. Start the environment (port `3001`).
3. Point `DevEnv.apiBaseUrl` at `http://10.0.2.2:3001/api/v1` (or `http://localhost:3001/api/v1` on iOS sim).
4. Mockoon serves the responses defined in `openapi.yaml` examples.

For edge-case testing, hit any path with `?scenario=…`:

```
GET http://localhost:3001/api/v1/products?scenario=slow
GET http://localhost:3001/api/v1/products?scenario=empty
GET http://localhost:3001/api/v1/products?scenario=rate_limit
POST http://localhost:3001/api/v1/auth/login?scenario=validation
```

> If you want the *real* Next.js mock (with seeded DB, JWT, WebSocket), use port `3000`.
> Mockoon is for **deterministic** mocks — same input → same output every time. Best for
> CI integration tests where flake is unacceptable.

---

## 11. Testing Patterns

### 11.1 Unit-test a repository with a mocked Dio

```dart
final dio  = MockDio();
final repo = AuthRepositoryImpl(AuthRemoteDataSource(dio), AuthLocalDataSource(MockStorage()));

when(dio.post('/auth/login', data: anyNamed('data'))).thenAnswer((_) async => Response(
  requestOptions: RequestOptions(path: '/auth/login'),
  statusCode: 200,
  data: {
    'success': true, 'message': 'Login successful.',
    'data': {
      'user': {/* … */},
      'access_token': 'abc', 'refresh_token': 'xyz',
      'token_type': 'Bearer', 'expires_in': 900,
    }
  },
));

final result = await repo.login(email: 'user@mock.com', password: 'password123');
expect(result.isOk, isTrue);
```

### 11.2 Widget-test a form against the validation envelope

```dart
when(authBloc.state).thenReturn(AuthState(
  status: AuthStatus.unauthenticated,
  formErrors: {'email': ['The email must be valid.']},
));
// pump LoginPage, expect Finder for "The email must be valid." to appear under email field.
```

---

## 12. Cheat Sheet

| Need | Where |
|---|---|
| Add a new endpoint | Update `openapi.yaml` → regen models → add datasource method → wire through repository → Bloc event |
| Force a 422 from server | Append `?scenario=validation` |
| Force a slow network | Append `?scenario=slow` (3 s) or `?scenario=very_slow` (10 s) |
| Force token refresh | Append `?scenario=unauthorized` on the first call after login |
| Force force-update screen | `GET /config/force-update?platform=android&app_version=1.0.0` |
| Reset all data | `npm run reset` in the Next.js repo |
| Switch to Mockoon | Change `DevEnv.apiBaseUrl` and `import mockoon-environment.json` |
| Inspect what was sent / received | `PrettyDioLogger` (debug only) |

---

## See Also

- `openapi.yaml` — Endpoint contract
- `00-overview.md` — Response envelope, error codes, status codes, conventions
- `postman_collection.json` — Postman v2.1 collection
- `mockoon-environment.json` — Mockoon importable environment
