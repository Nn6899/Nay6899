import { doc, getDocFromServer } from 'firebase/firestore';
import { db, isFirebaseConfigured } from './config';

export interface ConnectionStatus {
  isConfigured: boolean;
  isConnected: boolean;
  checking: boolean;
  message: string;
  projectId?: string;
  error?: string;
}

export async function checkFirebaseConnection(): Promise<ConnectionStatus> {
  if (!isFirebaseConfigured || !db) {
    return {
      isConfigured: false,
      isConnected: false,
      checking: false,
      message: 'Chưa cấu hình Firebase API key trong biến môi trường (.env)',
    };
  }

  try {
    // Firestore ping test
    await getDocFromServer(doc(db, '_health_check_', 'ping'));
    return {
      isConfigured: true,
      isConnected: true,
      checking: false,
      message: 'Kết nối Firebase Firestore thành công',
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    };
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const isOffline = errorMsg.includes('client is offline') || errorMsg.includes('unavailable');
    
    // In Firestore, if document doesn't exist, getDocFromServer still succeeds.
    // If it throws permission-denied, Firestore IS reachable!
    const isReachable = errorMsg.includes('permission-denied') || errorMsg.includes('Missing or insufficient permissions');

    if (isReachable) {
      return {
        isConfigured: true,
        isConnected: true,
        checking: false,
        message: 'Đã kết nối Firestore (Security rules đang hoạt động)',
        projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      };
    }

    return {
      isConfigured: true,
      isConnected: !isOffline,
      checking: false,
      message: isOffline ? 'Không thể kết nối đến máy chủ Firestore (Ngoại tuyến/Mạng)' : `Lỗi kết nối: ${errorMsg}`,
      error: errorMsg,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    };
  }
}
