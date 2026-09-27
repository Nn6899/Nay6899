import React from 'react';
import { Database, CheckCircle2, AlertTriangle, RefreshCw, Server, ShieldCheck } from 'lucide-react';
import { useFirestoreConnection } from '../../hooks/useFirestoreConnection';
import { isFirebaseConfigured } from '../../firebase/config';

export const ConnectionStatusCard: React.FC = () => {
  const { status, recheck } = useFirestoreConnection();

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">Trạng Thái Kết Nối Firebase</h3>
            <p className="text-xs text-slate-500">Hệ cơ sở dữ liệu Firestore, Xác thực Auth & Lưu trữ Storage</p>
          </div>
        </div>

        <button
          type="button"
          onClick={recheck}
          disabled={status.checking}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${status.checking ? 'animate-spin' : ''}`} />
          <span>Kiểm tra lại</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        {/* Firestore */}
        <div className="p-3.5 rounded-xl border border-slate-100 bg-slate-50 flex items-start justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500 block">Cloud Firestore</span>
            <span className="text-sm font-semibold text-slate-800">
              {status.isConnected ? 'Sẵn sàng hoạt động' : isFirebaseConfigured ? 'Chờ xác thực/Mạng' : 'Môi trường Cục bộ'}
            </span>
          </div>
          {status.isConnected ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-amber-500" />
          )}
        </div>

        {/* Authentication */}
        <div className="p-3.5 rounded-xl border border-slate-100 bg-slate-50 flex items-start justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500 block">Firebase Auth</span>
            <span className="text-sm font-semibold text-slate-800">
              {isFirebaseConfigured ? 'Đã kết nối Auth SDK' : 'Chế độ Dev Auth (Local)'}
            </span>
          </div>
          <ShieldCheck className="w-5 h-5 text-blue-600" />
        </div>

        {/* Storage */}
        <div className="p-3.5 rounded-xl border border-slate-100 bg-slate-50 flex items-start justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500 block">Firebase Storage</span>
            <span className="text-sm font-semibold text-slate-800">
              {isFirebaseConfigured ? 'Đã khởi tạo' : 'Cấu hình trong .env'}
            </span>
          </div>
          <Server className="w-5 h-5 text-indigo-600" />
        </div>
      </div>

      <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl text-xs text-slate-600 border border-slate-100">
        <div className={`w-2.5 h-2.5 rounded-full ${status.isConnected ? 'bg-emerald-500' : 'bg-amber-500'}`} />
        <span className="font-medium">{status.message}</span>
        {status.projectId && (
          <span className="ml-auto font-mono text-[11px] bg-slate-200/60 px-2 py-0.5 rounded text-slate-700">
            Project: {status.projectId}
          </span>
        )}
      </div>
    </div>
  );
};
