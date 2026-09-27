import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from './config';

export async function uploadExamAsset(path: string, file: Blob | Uint8Array | ArrayBuffer): Promise<string> {
  if (!storage) {
    throw new Error('Firebase Storage chưa được khởi tạo');
  }
  const storageRef = ref(storage, path);
  const snapshot = await uploadBytes(storageRef, file);
  return await getDownloadURL(snapshot.ref);
}
