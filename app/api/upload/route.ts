import { NextRequest } from 'next/server';
import { v4 as uuid } from 'uuid';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { getDb } from '@/lib/db';
import { authenticate, isAuthError } from '@/lib/middleware';
import { successResponse, Errors } from '@/lib/response';
import { handleScenario } from '@/lib/scenario';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'video/mp4',
];

// POST /api/upload
export async function POST(request: NextRequest) {
  const scenarioResponse = await handleScenario(request);
  if (scenarioResponse) return scenarioResponse;

  try {
    const auth = authenticate(request);
    if (isAuthError(auth)) return auth;

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return Errors.validation('No file provided. Use field name "file"');
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return Errors.validation(`File too large. Max size: ${MAX_FILE_SIZE / 1024 / 1024}MB`);
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return Errors.validation(`File type not allowed. Allowed: ${ALLOWED_TYPES.join(', ')}`);
    }

    // Generate unique filename
    const ext = path.extname(file.name);
    const filename = `${uuid()}${ext}`;

    // Ensure upload directory exists
    await mkdir(UPLOAD_DIR, { recursive: true });

    // Write file
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const filepath = path.join(UPLOAD_DIR, filename);
    await writeFile(filepath, buffer);

    // Store metadata in DB
    const db = getDb();
    const id = uuid();
    const url = `/uploads/${filename}`;

    db.prepare(`
      INSERT INTO uploads (id, filename, original_name, mime_type, size, url, user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, filename, file.name, file.type, file.size, url, auth.id);

    return successResponse({
      data: {
        id,
        filename,
        original_name: file.name,
        mime_type: file.type,
        size: file.size,
        url,
      },
      message: 'File uploaded successfully',
      status: 201,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return Errors.internal();
  }
}
