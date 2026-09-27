import { useState, useEffect, useCallback } from 'react';
import { checkFirebaseConnection, type ConnectionStatus } from '../firebase/connection';

export function useFirestoreConnection() {
  const [status, setStatus] = useState<ConnectionStatus>({
    isConfigured: false,
    isConnected: false,
    checking: true,
    message: 'Đang kiểm tra kết nối Firebase...',
  });

  const recheck = useCallback(async () => {
    setStatus((prev) => ({ ...prev, checking: true }));
    const res = await checkFirebaseConnection();
    setStatus(res);
  }, []);

  useEffect(() => {
    recheck();
  }, [recheck]);

  return { status, recheck };
}
