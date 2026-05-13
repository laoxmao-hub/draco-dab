/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthProvider, useAuth } from './lib/AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import { LogIn, LogOut, Package, PlusCircle, BarChart3, Camera, Loader2, X, FileSpreadsheet, ChevronRight, ArrowLeft, Upload, Table as TableIcon, MoreVertical, Download, Menu, Clock, History, Pencil, Boxes, Inbox, Plus, Trash2 } from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { collection, addDoc, serverTimestamp, query, where, onSnapshot, orderBy, doc, updateDoc, writeBatch, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './lib/firebase';
import { uploadToCloudinary } from './lib/cloudinary';
import * as XLSX from 'xlsx';

type Tab = 'management' | 'excel' | 'edit' | 'timeline';

interface StockItem {
  id?: string;
  name: string;
  sku: string;
  category: string;
  price: number;
  quantity: number;
  imageUrl?: string;
  ownerId: string;
  createdAt: any;
  updatedAt: any;
}

interface Accessory {
  name: string;
  quantity: number;
}

interface ProjectEntry {
  id: string;
  projectName: string;
  projectCode: string;
  cluster: string;
  moduleCode: string;
  quantity: number;
  accessories?: Accessory[];
  status?: string;
  statusHistory?: string[];
  ownerId: string;
  createdAt: any;
  sortIndex?: number;
}

interface ActivityLog {
  id: string;
  userName: string;
  userEmail: string;
  action: string;
  details: string;
  timestamp: any;
  projectCode?: string;
  moduleCode?: string;
}

const PHASES = {
  'Giao Nhận': ['Đã nhận', 'Chưa có', 'Gửi lại X1'],
  'Nguội - Sơn': ['Làm Nguội', 'Đã Sơn', 'Đang Defect'],
  'Lắp Ráp': ['Đang Lắp', 'Dựng Mẫu', 'Chờ PK'],
  'Đóng Gói': ['Đang Đóng', 'Chờ Lệnh'],
  'Giao Xe': ['Đã Packing', 'Chờ Lệnh'],
};

function TimelineScreen() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'activities'), orderBy('timestamp', 'desc'), limit(50));
    const unsub = onSnapshot(q, (snapshot) => {
      setLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ActivityLog)));
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'activities');
      setLoading(false);
    });
    return unsub;
  }, []);

  const formatTime = (ts: any) => {
    if (!ts) return '';
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return date.toLocaleString('vi-VN', { 
      hour: '2-digit', 
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4 pb-24"
    >
      <div className="flex items-center justify-between border-b border-gray-200 pb-2">
        <h2 className="text-xl font-medium text-gray-800 flex items-center">
          <History size={24} className="mr-2 text-primary" />
          Dòng Thời Gian
        </h2>
      </div>

      <div className="space-y-3">
        {loading ? (
          <div className="flex justify-center p-12">
            <Loader2 size={32} className="animate-spin text-primary" />
          </div>
        ) : logs.length > 0 ? (
          logs.map((log) => (
            <div key={log.id} className="bg-white p-4 rounded shadow-sm border-l-4 border-info flex flex-col space-y-2">
              <div className="flex justify-between items-start">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600">
                    {log.userName.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-gray-800">{log.userName}</span>
                    <span className="text-[10px] text-gray-400">{log.userEmail}</span>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-gray-400 bg-gray-50 px-2 py-1 rounded">
                  {formatTime(log.timestamp)}
                </span>
              </div>
              <div className="pl-10">
                <p className="text-xs text-gray-700 font-medium">
                  <span className="text-info font-bold">{log.action}</span>: {log.details}
                </p>
                {(log.projectCode || log.moduleCode) && (
                  <div className="mt-1 flex items-center space-x-2">
                    <span className="text-[9px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-bold uppercase">
                      DA: {log.projectCode}
                    </span>
                    <span className="text-[9px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded font-bold uppercase">
                      M: {log.moduleCode}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="p-12 text-center text-gray-400 italic bg-white rounded shadow-sm">
            Chưa có hoạt động nào được ghi nhận.
          </div>
        )}
      </div>
    </motion.div>
  );
}

function EditProjectScreen({ 
  onComplete, 
  initialProjectCode,
  projectEntries 
}: { 
  onComplete: () => void, 
  initialProjectCode: string | null,
  projectEntries: ProjectEntry[],
  key?: string
}) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [selectedCode, setSelectedCode] = useState(initialProjectCode || '');
  const [projectName, setProjectName] = useState('');
  
  // Group entries by code for selection info
  const projects = Array.from(new Set(projectEntries.map(p => p.projectCode))).map(code => {
    const entry = projectEntries.find(p => p.projectCode === code);
    return { code, name: entry?.projectName || 'Không tên' };
  }).reverse();

  // Current entries being edited
  const [entries, setEntries] = useState<ProjectEntry[]>([]);

  useEffect(() => {
    if (selectedCode) {
      const p = projects.find(p => p.code === selectedCode);
      if (p) setProjectName(p.name);
      
      const pEntries = projectEntries.filter(p => p.projectCode === selectedCode);
      setEntries(JSON.parse(JSON.stringify(pEntries))); // Deep copy for editing
    } else {
      setProjectName('');
      setEntries([]);
    }
  }, [selectedCode]);

  const handleEntryChange = (id: string, field: keyof ProjectEntry, value: any) => {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedCode) return;
    setLoading(true);

    try {
      const batch = writeBatch(db);
      
      for (const entry of entries) {
        const entryRef = doc(db, 'projects', entry.id);
        batch.update(entryRef, {
          projectName: projectName,
          cluster: entry.cluster,
          moduleCode: entry.moduleCode,
          quantity: Number(entry.quantity) || 0
        });
      }

      await batch.commit();
      onComplete();
    } catch (error: any) {
      alert('Lỗi: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4 pb-24"
      id="edit-project-form"
    >
      <div className="flex items-center justify-between mb-4 border-b border-gray-200 pb-2" id="form-header">
        <h2 className="text-xl font-medium text-gray-800">Cập Nhật Dự Án</h2>
      </div>

      <div className="bg-white rounded shadow-sm border-t-4 border-primary p-6 space-y-6">
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-700 uppercase">Chọn Dự Án Đang Có</label>
            <select 
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:outline-none"
              value={selectedCode}
              onChange={e => setSelectedCode(e.target.value)}
              disabled={!!initialProjectCode}
            >
              <option value="">-- Chọn một dự án --</option>
              {projects.map(p => (
                <option key={p.code} value={p.code}>{p.name} ({p.code})</option>
              ))}
            </select>
            {initialProjectCode && (
              <p className="text-[10px] text-primary font-bold mt-1 uppercase">Đang chỉnh sửa dự án đã chọn</p>
            )}
          </div>

          {selectedCode && (
            <form onSubmit={handleSubmit} className="space-y-6 anim-fade-in">
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-700 uppercase">Tên Dự Án</label>
                <input
                  required
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-primary"
                  placeholder="Tên dự án"
                  value={projectName}
                  onChange={e => setProjectName(e.target.value)}
                />
              </div>

              <div className="space-y-3">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest border-b border-gray-100 pb-2">Danh sách Module</h3>
                <div className="space-y-3">
                  {entries.map((entry, idx) => (
                    <div key={entry.id} className="p-3 bg-gray-50 rounded border border-gray-200 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-gray-400 uppercase">Module #{idx + 1}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-gray-500 uppercase">Cụm</label>
                          <input 
                            className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:border-primary outline-none"
                            value={entry.cluster}
                            onChange={e => handleEntryChange(entry.id, 'cluster', e.target.value)}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-gray-500 uppercase">Mã hàng</label>
                          <input 
                            className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:border-primary outline-none"
                            value={entry.moduleCode}
                            onChange={e => handleEntryChange(entry.id, 'moduleCode', e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-gray-500 uppercase">Số lượng</label>
                        <input 
                          type="number"
                          className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:border-primary outline-none"
                          value={entry.quantity}
                          onChange={e => handleEntryChange(entry.id, 'quantity', e.target.value)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <button
                disabled={loading}
                type="submit"
                className="w-full btn-primary font-bold py-3 rounded shadow-sm flex items-center justify-center space-x-2 disabled:opacity-50"
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : <span>LƯU TẤT CẢ THAY ĐỔI</span>}
              </button>
            </form>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function StatsOverview({ items }: { items: StockItem[] }) {
  const totalItems = items.length;
  const lowStock = items.filter(i => i.quantity < 5).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" id="info-boxes">
        <div className="bg-white flex rounded shadow-sm overflow-hidden" id="box-total">
          <div className="w-20 bg-info flex items-center justify-center text-white">
            <Package size={28} />
          </div>
          <div className="flex-1 p-3">
            <span className="text-xs font-semibold text-gray-600 block uppercase">Tổng mặt hàng</span>
            <span className="text-xl font-bold text-gray-800">{totalItems}</span>
          </div>
        </div>
        <div className="bg-white flex rounded shadow-sm overflow-hidden" id="box-low">
          <div className="w-20 bg-danger flex items-center justify-center text-white">
            <BarChart3 size={28} />
          </div>
          <div className="flex-1 p-3">
            <span className="text-xs font-semibold text-gray-600 block uppercase">Sắp hết hàng</span>
            <span className="text-xl font-bold text-gray-800">{lowStock}</span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded shadow-sm border-t-4 border-primary overflow-hidden" id="recent-items-card">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700 uppercase">Hàng hóa mới nhất</h3>
        </div>
        <div className="overflow-x-auto">
          {items.length > 0 ? (
            <table className="w-full text-left">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Sản phẩm</th>
                  <th className="px-4 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-right">SL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.slice(0, 5).map(item => (
                  <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3 flex items-center space-x-3">
                      <div className="w-8 h-8 rounded bg-gray-100 flex-shrink-0 overflow-hidden border border-gray-200">
                        <img src={item.imageUrl || ''} alt="" className="w-full h-full object-cover" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">{item.name}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${item.quantity < 5 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                        {item.quantity}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-8 text-center text-gray-400 text-sm italic">
              Chưa có mặt hàng nào.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ExcelImportScreen({ onComplete }: { onComplete: () => void, key?: string }) {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [data, setData] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [projectInfo, setProjectInfo] = useState({
    name: '',
    code: ''
  });
  const [mapping, setMapping] = useState({
    cluster: '',
    moduleCode: '',
    quantity: ''
  });
  const [accessoryMappings, setAccessoryMappings] = useState<string[]>(['']);
  const [loading, setLoading] = useState(false);

  const addAccessoryMapping = () => setAccessoryMappings([...accessoryMappings, '']);
  const updateAccessoryMapping = (index: number, value: string) => {
    const newMappings = [...accessoryMappings];
    newMappings[index] = value;
    setAccessoryMappings(newMappings);
  };
  const removeAccessoryMapping = (index: number) => {
    setAccessoryMappings(accessoryMappings.filter((_, i) => i !== index));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      const reader = new FileReader();
      reader.onload = (evt) => {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const json = XLSX.utils.sheet_to_json(ws);
        if (json.length > 0) {
          setData(json);
          setHeaders(Object.keys(json[0] as object));
        }
      };
      reader.readAsBinaryString(f);
    }
  };

  const handleImport = async () => {
    if (!user || data.length === 0) return;
    if (!projectInfo.name || !projectInfo.code) {
      alert("Vui lòng nhập Tên Dự Án và Mã Dự Án.");
      return;
    }
    if (!mapping.cluster || !mapping.moduleCode || !mapping.quantity) {
      alert("Vui lòng ánh xạ đầy đủ các cột: Cụm, Module, Số lượng.");
      return;
    }

    setLoading(true);
    const path = 'projects';
    try {
      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        
        // Extract accessories
        const accessories: Accessory[] = [];
        accessoryMappings.forEach(col => {
          if (col && row[col]) {
            const val = String(row[col]);
            if (val.includes(':')) {
              const parts = val.split(':');
              const name = parts[0].trim();
              const qty = Number(parts[parts.length - 1]) || 1;
              accessories.push({ name, quantity: qty });
            } else {
              accessories.push({ name: val.trim(), quantity: 1 });
            }
          }
        });

        await addDoc(collection(db, path), {
          projectName: projectInfo.name,
          projectCode: projectInfo.code,
          cluster: String(row[mapping.cluster] || ''),
          moduleCode: String(row[mapping.moduleCode] || ''),
          quantity: Number(row[mapping.quantity]) || 0,
          accessories,
          ownerId: user.uid,
          createdAt: serverTimestamp(),
          sortIndex: i
        });
      }
      onComplete();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="space-y-4 pb-24"
      id="excel-import-screen"
    >
      <div className="flex items-center justify-between border-b border-gray-200 pb-2">
        <h2 className="text-xl font-medium text-gray-800">Nhập Excel Dự Án</h2>
      </div>

      <div className="bg-white rounded shadow-sm border-t-4 border-success p-6 space-y-6" id="import-card">
        {/* Manual Info Section */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-b border-gray-100 pb-6">
          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-700 uppercase">Tên Dự Án *</label>
            <input 
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-success focus:outline-none transition-all"
              placeholder="VD: Dự án Chung cư A"
              value={projectInfo.name}
              onChange={e => setProjectInfo({...projectInfo, name: e.target.value})}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-700 uppercase">Mã Dự Án *</label>
            <input 
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-success focus:outline-none transition-all"
              placeholder="VD: DA-CCA-2024"
              value={projectInfo.code}
              onChange={e => setProjectInfo({...projectInfo, code: e.target.value})}
            />
          </div>
        </div>

        {!file ? (
          <div className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg py-12 space-y-4 bg-gray-50 hover:bg-gray-100 transition-colors">
            <Upload size={48} className="text-gray-400" />
            <div className="text-center">
              <p className="text-gray-600 font-semibold text-lg">Chọn File Excel dật tư</p>
              <p className="text-gray-400 text-sm">Cần chứa các thông tin Cụm, Module, Số lượng</p>
            </div>
            <label className="btn-success px-6 py-2 rounded font-semibold cursor-pointer shadow-sm transform active:scale-95 inline-block">
              Tải File Lên
              <input type="file" className="hidden" accept=".xlsx, .xls" onChange={handleFileUpload} />
            </label>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center space-x-3 p-4 bg-green-50 rounded border border-green-100">
              <FileSpreadsheet size={24} className="text-success" />
              <div className="flex-1">
                <p className="text-sm font-bold text-gray-800">{file.name}</p>
                <p className="text-[10px] text-gray-500 uppercase">{data.length} dòng dữ liệu</p>
              </div>
              <button onClick={() => {setFile(null); setData([]); setHeaders([]);}} className="text-gray-400 hover:text-danger p-2">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4" id="mapping-section">
              <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Ánh xạ cột Excel</h3>
              
              <div className="grid grid-cols-1 gap-4">
                {[
                  { key: 'cluster', label: 'Cụm' },
                  { key: 'moduleCode', label: 'Module / Mã Hàng' },
                  { key: 'quantity', label: 'Số Lượng' }
                ].map(field => (
                  <div key={field.key} className="space-y-1">
                    <label className="text-xs font-semibold text-gray-600">{field.label} *</label>
                    <select 
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-success focus:outline-none"
                      value={mapping[field.key as keyof typeof mapping]}
                      onChange={e => setMapping({...mapping, [field.key]: e.target.value})}
                    >
                      <option value="">-- Chọn cột --</option>
                      {headers.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                ))}

                <div className="pt-2 border-t border-gray-100">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Cột Phụ Kiện</label>
                    <button 
                      onClick={addAccessoryMapping}
                      className="text-[10px] font-bold text-primary hover:underline flex items-center"
                    >
                      <PlusCircle size={12} className="mr-1" /> THÊM CỘT
                    </button>
                  </div>
                  <div className="space-y-2">
                    {accessoryMappings.map((am, idx) => (
                      <div key={idx} className="flex items-center space-x-2">
                        <select 
                          className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm focus:border-success focus:outline-none"
                          value={am}
                          onChange={e => updateAccessoryMapping(idx, e.target.value)}
                        >
                          <option value="">-- Chọn cột phụ kiện {idx + 1} --</option>
                          {headers.map(h => (
                            <option key={h} value={h}>{h}</option>
                          ))}
                        </select>
                        {accessoryMappings.length > 1 && (
                          <button onClick={() => removeAccessoryMapping(idx)} className="p-2 text-gray-400 hover:text-danger">
                            <X size={16} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <button
              disabled={loading}
              onClick={handleImport}
              className="w-full btn-success font-bold py-3 rounded shadow-sm flex items-center justify-center space-x-2 disabled:opacity-50"
            >
              {loading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <>
                  <Upload size={18} />
                  <span>Xác nhận nhập {data.length} dòng</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function ManagementScreen({ 
  items, 
  projectEntries, 
  selectedProject, 
  setSelectedProject,
  loading,
  isSelectMode,
  setIsSelectMode,
  selectedModuleIds,
  setSelectedModuleIds,
  showBulkModal,
  setShowBulkModal
}: { 
  items: StockItem[], 
  projectEntries: ProjectEntry[],
  selectedProject: string | null,
  setSelectedProject: (code: string | null) => void,
  loading: boolean,
  isSelectMode: boolean,
  setIsSelectMode: (m: boolean) => void,
  selectedModuleIds: string[],
  setSelectedModuleIds: (ids: string[] | ((prev: string[]) => string[])) => void,
  showBulkModal: boolean,
  setShowBulkModal: (b: boolean) => void,
  key?: string
}) {
  const { user, role } = useAuth();
  const isPrivileged = role === 'admin' || role === 'mod';
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);

  // Unique projects grouping
  const projects = Array.from(new Set(projectEntries.map(p => p.projectCode))).map(code => {
    const entries = projectEntries.filter(p => p.projectCode === code);
    const entry = entries[0];
    
    // Calculate overall status for summary
    const statusSummary = entries.reduce((acc: any, curr) => {
      if (curr.status) {
        const lastPart = curr.status.split(' - ').pop() || '';
        acc[lastPart] = (acc[lastPart] || 0) + 1;
      }
      return acc;
    }, {});

    // Find latest status across all modules in this project
    const sampleStatus = entries.find(e => e.status)?.status || 'Chưa có trạng thái';

    // Total accessories
    const totalAccessories = entries.reduce((acc, curr) => {
      return acc + (curr.accessories?.reduce((a, c) => a + c.quantity, 0) || 0);
    }, 0);

    return {
      code,
      name: entry?.projectName || 'Không tên',
      count: entries.length,
      totalAccessories,
      statusSummary,
      latestStatus: sampleStatus
    };
  }).reverse();

  const toggleSelection = (id: string) => {
    setSelectedModuleIds(prev => {
      const next = prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id];
      return next;
    });
  };

  const handleRowClick = (entry: ProjectEntry) => {
    if (isSelectMode) {
      toggleSelection(entry.id);
    } else {
      setSelectedModuleId(entry.id);
    }
  };

  if (selectedProject) {
    const entries = projectEntries.filter(p => p.projectCode === selectedProject);
    const pName = entries[0]?.projectName || '';
    const currentModule = selectedModuleId ? entries.find(e => e.id === selectedModuleId) : null;

    return (
      <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4 pb-24">
        <button onClick={() => setSelectedProject(null)} className="flex items-center text-sm text-gray-500 hover:text-primary transition-colors mb-2">
          <ArrowLeft size={16} className="mr-1" /> Quay lại danh sách
        </button>
        <div className="flex items-center justify-between border-b border-gray-200 pb-2">
          <h2 className="text-xl font-medium text-gray-800">{pName}</h2>
          <span className="text-xs font-bold bg-primary/10 text-primary px-2 py-0.5 rounded">{selectedProject}</span>
        </div>

        <div className="bg-white rounded shadow-sm border-t-4 border-info overflow-hidden relative">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <TableIcon size={16} className="text-info" />
              <h3 className="text-sm font-semibold text-gray-700">Chi tiết Module {selectedModuleIds.length > 0 && `(Đang chọn ${selectedModuleIds.length})`}</h3>
            </div>
            {isSelectMode && (
              <button 
                onClick={() => { setSelectedModuleIds([]); setIsSelectMode(false); }}
                className="text-xs font-bold text-gray-400 hover:text-danger"
              >
                HỦY CHỌN
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {selectedModuleIds.length > 0 && <th className="px-4 py-2 w-10"></th>}
                  <th className="px-4 py-2 text-[10px] font-bold text-gray-500 uppercase">Module / Cụm</th>
                  <th className="px-4 py-2 text-[10px] font-bold text-gray-500 uppercase text-right">SL</th>
                  <th className="px-4 py-2 text-[10px] font-bold text-gray-500 uppercase pl-6">Trạng thái (5 gần nhất)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {entries.map(entry => {
                  const isSelected = selectedModuleIds.includes(entry.id);

                  return (
                    <tr 
                      key={entry.id} 
                      className={`hover:bg-gray-50/50 transition-colors cursor-pointer group select-none ${isSelected ? 'bg-blue-50' : ''}`}
                      onClick={() => handleRowClick(entry)}
                    >
                      {isSelectMode && (
                        <td className="px-4 py-3">
                          <input 
                            type="checkbox" 
                            checked={isSelected} 
                            readOnly 
                            className="w-4 h-4 rounded text-primary border-gray-300 focus:ring-primary"
                          />
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="text-[10px] text-gray-400 font-bold uppercase mb-0.5">{entry.cluster || 'N/A'}</span>
                          <div className="flex items-center text-sm font-bold text-gray-800">
                            {entry.moduleCode}
                            {!isSelectMode && <ChevronRight size={12} className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity text-primary" />}
                          </div>
                          {entry.accessories && entry.accessories.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {entry.accessories.map((a, i) => (
                                <span key={i} className="text-[8px] bg-orange-50 text-orange-600 px-1 py-0 rounded border border-orange-100 font-bold uppercase">
                                  {a.name}: {a.quantity}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-bold text-gray-600">{entry.quantity}</td>
                      <td className="px-4 py-3 pl-6">
                        <div className="flex flex-wrap gap-1.5 overflow-hidden">
                          {entry.statusHistory?.slice(-5).reverse().map((h, i) => (
                            <div key={i} className={`px-2 py-0.5 border rounded text-[9px] leading-tight ${i === 0 ? 'bg-blue-50 border-blue-200 text-blue-700 font-bold' : 'bg-gray-50 border-gray-100 text-gray-400 font-normal'}`}>
                              {h}
                            </div>
                          )) || <span className="text-[10px] text-gray-300 italic">Chưa có cập nhật</span>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Accessory Summary Section - Positioned below the module list but styled as a separate section */}
        <div className="mt-8 space-y-4">
          <div className="flex items-center space-x-2 px-1">
            <Boxes size={20} className="text-orange-500" />
            <h3 className="text-base font-bold text-gray-800 uppercase tracking-wide">Bảng Tổng Hợp Phụ Kiện Dự Án</h3>
          </div>
          
          <div className="bg-white rounded-xl shadow-lg border border-orange-100 overflow-hidden">
            <div className="p-4 bg-orange-50/50 border-b border-orange-100 flex items-center justify-between">
              <span className="text-[10px] font-black text-orange-600 uppercase tracking-widest">Thông tin chi tiết phụ kiện</span>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 rounded-full bg-orange-400 animate-pulse"></div>
                <span className="text-[10px] font-bold text-orange-500 uppercase">Đã tổng hợp từ {entries.length} module</span>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-6 py-3 text-[10px] font-bold text-gray-500 uppercase">Tên Phụ Kiện</th>
                    <th className="px-6 py-3 text-[10px] font-bold text-gray-500 uppercase text-right">Tổng Số Lượng</th>
                    <th className="px-6 py-3 text-[10px] font-bold text-gray-500 uppercase pl-8">Phân bổ tại Module</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(() => {
                    const accMap = entries.reduce((acc: any, entry) => {
                      entry.accessories?.forEach(a => {
                        if (!acc[a.name]) acc[a.name] = { total: 0, modules: [] };
                        acc[a.name].total += a.quantity;
                        acc[a.name].modules.push(entry.moduleCode);
                      });
                      return acc;
                    }, {});

                    const sortedAccs = Object.entries(accMap).sort();

                    return sortedAccs.length > 0 ? sortedAccs.map(([name, data]: [string, any]) => (
                      <tr key={name} className="hover:bg-orange-50/10 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center space-x-3">
                            <div className="p-2 bg-orange-100 rounded-lg text-orange-600">
                              <Inbox size={16} />
                            </div>
                            <span className="text-sm font-bold text-gray-800">{name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-right font-black text-orange-600 tabular-nums">
                          {data.total}
                        </td>
                        <td className="px-6 py-4 pl-8">
                          <div className="flex flex-wrap gap-1.5">
                            {Array.from(new Set(data.modules as string[])).map((m: any) => (
                              <span key={m} className="text-[9px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-bold border border-gray-200">
                                {m}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={3} className="px-6 py-12 text-center text-gray-400 italic text-xs">
                          <div className="flex flex-col items-center space-y-2">
                            <Boxes size={32} className="opacity-20" />
                            <span>Dự án này không có vật tư phụ kiện.</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {showBulkModal && (
          <StatusUpdateModal 
            onClose={() => { setShowBulkModal(false); setSelectedModuleIds([]); setIsSelectMode(false); }} 
            entries={entries}
            preSelectedIds={selectedModuleIds}
          />
        )}

        {currentModule && (
          <ModuleDetailModal 
            key={selectedModuleId} // IMPORTANT: Force fresh state when switching modules
            module={currentModule} 
            onClose={() => setSelectedModuleId(null)} 
            projectAccessories={Array.from(new Set(entries.flatMap(e => e.accessories || []).map(a => a.name)))}
          />
        )}
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      className="space-y-6 pb-24"
      id="management-view"
    >
      <div className="flex items-center justify-between border-b border-gray-200 pb-2" id="management-header">
        <h2 className="text-xl font-medium text-gray-800">Quản Lý Dự Án</h2>
        <span className="text-xs text-gray-500 font-normal">Tổng: {projects.length} dự án</span>
      </div>

      <div className="space-y-3" id="project-list">
        {projects.length > 0 ? (
          projects.map(p => (
            <div 
              key={p.code} 
              onClick={() => setSelectedProject(p.code)}
              className="bg-white p-4 rounded shadow-sm border-l-4 border-primary flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
            >
              <div className="flex-1 flex items-center space-x-3">
                <div className="w-10 h-10 bg-blue-50 rounded flex items-center justify-center text-primary font-bold flex-shrink-0">
                  {p.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 pr-4">
                  <h4 className="text-sm font-bold text-gray-800 truncate">{p.name}</h4>
                  <p className="text-[10px] text-gray-500 uppercase tracking-tight">
                    {p.code} • {p.count} Module • {p.totalAccessories} Phụ kiện
                  </p>
                  <div className="mt-1 flex items-center space-x-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></div>
                    <span className="text-[9px] text-primary font-bold uppercase tracking-tight truncate max-w-[200px]">Latest: {p.latestStatus}</span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center space-x-4">
                <div className="hidden md:flex flex-wrap gap-1 justify-end max-w-[200px]">
                  {Object.entries(p.statusSummary).map(([status, count]) => (
                    <span key={status} className="text-[8px] bg-gray-100 px-1.5 py-0.5 rounded text-gray-600 font-bold uppercase truncate">
                      {status}: {count as number}
                    </span>
                  ))}
                </div>
                <ChevronRight size={18} className="text-gray-300" />
              </div>
            </div>
          ))
        ) : (
          <div className="bg-white p-12 rounded shadow-sm border border-gray-100 flex flex-col items-center justify-center text-gray-400 space-y-4">
            <Package size={48} className="opacity-20" />
            <p className="text-sm italic">Chưa có dự án nào được nhập.</p>
          </div>
        )}
      </div>

      <div className="mt-8">
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 px-1">Kho Hàng Chung</h3>
        <StatsOverview items={items} />
      </div>
    </motion.div>
  );
}

function ModuleDetailModal({ 
  module, 
  onClose,
  projectAccessories = []
}: { 
  module: ProjectEntry, 
  onClose: () => void,
  projectAccessories?: string[],
  key?: string
}) {
  const { user, role } = useAuth();
  const isPrivileged = role === 'admin' || role === 'mod';
  const [showStatusForm, setShowStatusForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editCluster, setEditCluster] = useState(module.cluster || '');
  const [editModuleCode, setEditModuleCode] = useState(module.moduleCode || '');
  const [editQuantity, setEditQuantity] = useState(module.quantity || 0);
  const [editAccessories, setEditAccessories] = useState<Accessory[]>(module.accessories || []);
  const [saveLoading, setSaveLoading] = useState(false);

  // Group history by phase
  const groupedHistory = Object.keys(PHASES).reduce((acc: any, phase) => {
    acc[phase] = (module.statusHistory || []).filter(h => h.includes(`${phase}:`));
    return acc;
  }, {});

  const handleSaveInfo = async () => {
    if (!user || !module.id) return;
    setSaveLoading(true);
    try {
      const docRef = doc(db, 'projects', module.id);
      await updateDoc(docRef, {
        cluster: editCluster,
        moduleCode: editModuleCode,
        quantity: Number(editQuantity),
        accessories: editAccessories
      });

      // Log activity
      await addDoc(collection(db, 'activities'), {
        userName: user.displayName || 'Anonymous',
        userEmail: user.email,
        action: 'Sửa thông tin module',
        details: `Cụm: ${editCluster} | Mã: ${editModuleCode} | SL: ${editQuantity} | PK: ${editAccessories.map(a => `${a.name}(${a.quantity})`).join(', ')}`,
        projectCode: module.projectCode,
        moduleCode: editModuleCode,
        timestamp: serverTimestamp()
      });

      setIsEditing(false);
    } catch (error: any) {
      alert('Lỗi khi lưu: ' + error.message);
    } finally {
      setSaveLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }} 
        animate={{ opacity: 1, scale: 1 }} 
        className="bg-white w-full max-w-lg rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
      >
        <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-primary text-white">
          <div className="flex-1 mr-4">
            {isEditing ? (
              <div className="space-y-2">
                <input 
                  className="w-full bg-white/10 border border-white/20 rounded px-2 py-1 text-sm font-bold text-white outline-none focus:bg-white/20"
                  value={editModuleCode}
                  onChange={e => setEditModuleCode(e.target.value)}
                  placeholder="Mã Module"
                />
                <div className="flex space-x-2">
                  <input 
                    className="flex-1 bg-white/10 border border-white/20 rounded px-2 py-1 text-[10px] text-white outline-none focus:bg-white/20"
                    value={editCluster}
                    onChange={e => setEditCluster(e.target.value)}
                    placeholder="Cụm"
                  />
                  <input 
                    type="number"
                    className="w-20 bg-white/10 border border-white/20 rounded px-2 py-1 text-[10px] text-white outline-none focus:bg-white/20"
                    value={editQuantity}
                    onChange={e => setEditQuantity(Number(e.target.value))}
                    placeholder="Số lượng"
                  />
                </div>
              </div>
            ) : (
              <>
                <h3 className="font-bold text-sm uppercase tracking-wider">Lịch sử Module: {module.moduleCode}</h3>
                <p className="text-[10px] opacity-80 uppercase">{module.projectName} • Cụm: {module.cluster || 'N/A'} • SL: {module.quantity}</p>
              </>
            )}
          </div>
          <div className="flex items-center space-x-2">
            {isPrivileged && (
              isEditing ? (
                <button 
                  onClick={handleSaveInfo}
                  disabled={saveLoading}
                  className="p-2 bg-success text-white rounded-full hover:scale-110 transition-transform disabled:opacity-50"
                  title="Lưu thay đổi"
                >
                  {saveLoading ? <Loader2 size={20} className="animate-spin" /> : <Upload size={20} />}
                </button>
              ) : (
                <button 
                  onClick={() => setIsEditing(true)}
                  className="p-2 hover:bg-white/20 rounded-full transition-colors"
                  title="Chỉnh sửa thông tin"
                >
                  <Pencil size={20} />
                </button>
              )
            )}
            <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-full transition-colors">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin">
          {/* Module Info Display */}
          <div className="bg-gray-50 rounded-lg p-3 border border-gray-100 flex justify-between items-center">
            <div className="space-y-1">
              <span className="text-[10px] text-gray-400 font-bold uppercase block">Thông tin Module</span>
              <div className="flex items-center space-x-3">
                <div>
                  <p className="text-[10px] text-gray-500 uppercase">Module</p>
                  <p className="text-sm font-bold text-gray-800">{module.moduleCode}</p>
                </div>
                <div className="h-4 border-l border-gray-200"></div>
                <div>
                  <p className="text-[10px] text-gray-500 uppercase">Cụm</p>
                  <p className="text-sm font-bold text-gray-800">{module.cluster || 'N/A'}</p>
                </div>
                <div className="h-4 border-l border-gray-200"></div>
                <div>
                  <p className="text-[10px] text-gray-500 uppercase">Số lượng</p>
                  <p className="text-sm font-bold text-gray-800">{module.quantity}</p>
                </div>
              </div>
              {module.accessories && module.accessories.length > 0 && (
                <div className="mt-4 space-y-2 pt-4 border-t border-gray-100">
                  <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Danh sách Phụ kiện Module</p>
                  <div className="grid grid-cols-2 gap-2">
                    {module.accessories.map((a, i) => (
                      <div key={i} className="flex items-center justify-between bg-orange-50/50 px-3 py-2 rounded-lg border border-orange-100 group hover:bg-orange-100 transition-colors">
                        <div className="flex items-center space-x-2">
                          <Inbox size={14} className="text-orange-500" />
                          <span className="text-[11px] font-bold text-gray-700 uppercase">{a.name}</span>
                        </div>
                        <span className="text-xs font-black text-orange-600">x{a.quantity}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {isEditing && (
            <div className="p-3 bg-blue-50/50 rounded-lg border border-blue-100 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-blue-600 uppercase">Sửa Phụ Kiện</span>
                <button 
                  onClick={() => setEditAccessories([...editAccessories, { name: '', quantity: 1 }])}
                  className="text-[10px] font-bold text-primary flex items-center hover:underline"
                >
                  <Plus size={12} className="mr-1" /> Thêm PK
                </button>
              </div>
              <div className="space-y-2">
                {editAccessories.map((a, idx) => (
                  <div key={idx} className="flex items-center space-x-2 relative">
                    <input 
                      list={`acc-suggestions-${idx}`}
                      className="flex-1 bg-white border border-gray-200 rounded px-2 py-1.5 text-xs outline-none focus:border-primary"
                      placeholder="Tên phụ kiện"
                      value={a.name}
                      onChange={e => {
                      const next = editAccessories.map((item, i) => 
                        i === idx ? { ...item, name: e.target.value } : item
                      );
                      setEditAccessories(next);
                    }}
                  />
                  <datalist id={`acc-suggestions-${idx}`}>
                    {projectAccessories.map(name => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                  <input 
                    type="number"
                    className="w-16 bg-white border border-gray-200 rounded px-2 py-1.5 text-xs outline-none focus:border-primary"
                    value={a.quantity}
                    onChange={e => {
                      const next = editAccessories.map((item, i) => 
                        i === idx ? { ...item, quantity: Number(e.target.value) } : item
                      );
                      setEditAccessories(next);
                    }}
                  />
                    <button 
                      onClick={() => setEditAccessories(editAccessories.filter((_, i) => i !== idx))}
                      className="p-1.5 text-gray-400 hover:text-danger"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {Object.keys(PHASES).map(phase => {
            const updates = groupedHistory[phase];
            return (
              <div key={phase} className="space-y-2">
                <div className="flex items-center space-x-2">
                  <div className={`w-2 h-2 rounded-full ${updates.length > 0 ? 'bg-primary' : 'bg-gray-300'}`}></div>
                  <h4 className="text-xs font-bold text-gray-700 uppercase tracking-tight">{phase}</h4>
                  <div className="flex-1 border-t border-gray-100"></div>
                  <span className="text-[10px] text-gray-400 font-bold">{updates.length} Cập nhật</span>
                </div>
                
                <div className="pl-4 space-y-1.5 border-l-2 border-gray-50 ml-1">
                  {updates.length > 0 ? (
                    [...updates].reverse().map((u: string, idx: number) => (
                      <div key={idx} className="flex items-start space-x-2 animate-fade-in">
                        <div className="w-1 h-1 rounded-full bg-gray-200 mt-1.5 flex-shrink-0"></div>
                        <span className="text-[11px] text-gray-600 leading-normal">
                          {u.split(' - ').slice(0, 1).join(' ')} - <span className="font-bold text-gray-800">{u.includes(': ') ? u.split(': ').pop() : u.split(' - ').pop()}</span>
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-[10px] text-gray-300 italic pl-3">Chưa có tiến trình cho giai đoạn này</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="p-4 bg-gray-50 border-t border-gray-100 grid grid-cols-2 gap-3">
          <button 
            onClick={isEditing ? () => setIsEditing(false) : onClose}
            className="py-2.5 bg-white border border-gray-300 text-gray-700 font-bold rounded text-xs uppercase tracking-widest hover:bg-gray-100 transition-colors"
          >
            {isEditing ? 'Hủy' : 'Đóng'}
          </button>
          {isPrivileged && (
            <button 
              onClick={() => setShowStatusForm(true)}
              className="py-2.5 bg-info text-white font-bold rounded text-xs uppercase tracking-widest hover:bg-blue-600 transition-colors flex items-center justify-center space-x-2"
            >
              <PlusCircle size={14} />
              <span>Cập nhật</span>
            </button>
          )}
        </div>

        {showStatusForm && (
          <StatusUpdateModal 
            onClose={() => setShowStatusForm(false)} 
            entries={[module]} 
            preSelectedId={module.id} 
          />
        )}
      </motion.div>
    </div>
  );
}

function StatusUpdateModal({ 
  onClose, 
  entries,
  preSelectedId,
  preSelectedIds
}: { 
  onClose: () => void, 
  entries: ProjectEntry[],
  preSelectedId?: string,
  preSelectedIds?: string[]
}) {
  const { user } = useAuth();
  const [selectedEntryIds, setSelectedEntryIds] = useState<string[]>(preSelectedIds || (preSelectedId ? [preSelectedId] : []));
  const [phase, setPhase] = useState<string>('');
  const [status, setStatus] = useState('');
  const [customStatus, setCustomStatus] = useState('');
  const [addProgress, setAddProgress] = useState(true);
  const [loading, setLoading] = useState(false);

  const handleUpdate = async () => {
    const finalStatus = customStatus.trim() || status;
    if (selectedEntryIds.length === 0 || !phase || !finalStatus || !user) return;
    setLoading(true);

    try {
      const batch = writeBatch(db);
      const now = new Date();
      const timeStr = `${now.getDate()}/${now.getMonth() + 1}`;
      const newStatusText = `${phase}: ${finalStatus}`;

      for (const id of selectedEntryIds) {
        const entry = entries.find(e => e.id === id);
        if (!entry) continue;

        const entryRef = doc(db, 'projects', id);
        const newUpdate = `${timeStr} - ${newStatusText}`;
        
        let newHistory = [...(entry.statusHistory || [])];
        
        if (addProgress || newHistory.length === 0) {
          newHistory.push(newUpdate);
        } else {
          newHistory[newHistory.length - 1] = newUpdate;
        }
        
        batch.update(entryRef, {
          status: newStatusText,
          statusHistory: newHistory
        });

        // Log activity
        const logRef = doc(collection(db, 'activities'));
        batch.set(logRef, {
          userName: user.displayName || 'Anonymous',
          userEmail: user.email,
          action: 'Cập nhật trạng thái',
          details: `Phase: ${phase} | Status: ${finalStatus}`,
          projectCode: entry.projectCode,
          moduleCode: entry.moduleCode,
          timestamp: serverTimestamp()
        });
      }
      
      await batch.commit();
      onClose();
    } catch (error: any) {
      alert('Lỗi: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const isBulk = selectedEntryIds.length > 1;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
      <motion.div 
        initial={{ y: '100%' }} 
        animate={{ y: 0 }} 
        className="bg-white w-full max-w-md rounded-t-xl sm:rounded-xl shadow-xl overflow-hidden"
      >
        <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-info text-white">
          <h3 className="font-bold flex items-center text-sm uppercase">
            <PlusCircle size={18} className="mr-2" />
            {isBulk ? `CẬP NHẬT ${selectedEntryIds.length} MODULE` : 'CẬP NHẬT TRẠNG THÁI'}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-white/20 rounded">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {!preSelectedId && !preSelectedIds && (
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-500 uppercase">Chọn Module</label>
              <select 
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-info outline-none"
                value={selectedEntryIds[0] || ''}
                onChange={e => setSelectedEntryIds([e.target.value])}
              >
                <option value="">-- Chọn Module --</option>
                {entries.map(e => (
                  <option key={e.id} value={e.id}>[{e.cluster || 'No cluster'}] {e.moduleCode}</option>
                ))}
              </select>
            </div>
          )}

          {isBulk && (
            <div className="p-3 bg-blue-50 rounded border border-blue-100 mb-2">
              <p className="text-[10px] text-blue-700 font-bold uppercase">Cập nhật hàng loạt cho:</p>
              <p className="text-xs text-blue-600 italic truncate">
                {entries.filter(e => selectedEntryIds.includes(e.id)).map(e => e.moduleCode).join(', ')}
              </p>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-500 uppercase">Giai Đoạn</label>
            <select 
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-info outline-none"
              value={phase}
              onChange={e => {
                setPhase(e.target.value);
                setStatus('');
                setCustomStatus('');
              }}
            >
              <option value="">-- Chọn Giai Đoạn --</option>
              {Object.keys(PHASES).map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          {phase && (
            <div className="space-y-3 animate-fade-in">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-500 uppercase">Trạng Thái Gợi Ý</label>
                <div className="grid grid-cols-2 gap-2">
                  {(PHASES as any)[phase].map((s: string) => (
                    <button
                      key={s}
                      onClick={() => {
                        setStatus(s);
                        setCustomStatus('');
                      }}
                      className={`text-xs py-2 px-3 rounded border transition-all font-medium ${status === s ? 'bg-info text-white border-info' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-info'}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-500 uppercase">Hoặc Nhập Trạng Thái Khác</label>
                <input 
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-info outline-none"
                  placeholder="Nhập nội dung trạng thái..."
                  value={customStatus}
                  onChange={e => {
                    setCustomStatus(e.target.value);
                    if (e.target.value.trim()) setStatus('');
                  }}
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between p-3 bg-gray-50 rounded border border-gray-100">
            <div className="flex flex-col">
              <span className="text-xs font-bold text-gray-700">Thêm tiến trình</span>
              <span className="text-[10px] text-gray-400 italic">Tắt để sửa trạng thái cũ</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="sr-only peer" 
                checked={addProgress}
                onChange={() => setAddProgress(!addProgress)}
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-info"></div>
            </label>
          </div>

          <button
            disabled={loading || !(customStatus.trim() || status)}
            onClick={handleUpdate}
            className="w-full btn-info font-bold py-3 mt-4 rounded shadow flex items-center justify-center space-x-2 disabled:opacity-50"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <span>XÁC NHẬN CẬP NHẬT</span>}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function MainScreen() {
  const { user, logout, role } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('management');
  const [items, setItems] = useState<StockItem[]>([]);
  const [projectEntries, setProjectEntries] = useState<ProjectEntry[]>([]);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Lifted selection state
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedModuleIds, setSelectedModuleIds] = useState<string[]>([]);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showExtraMenu, setShowExtraMenu] = useState(false);

  const exportToExcel = (allProjects = false) => {
    const entries = allProjects 
      ? projectEntries 
      : projectEntries.filter(p => p.projectCode === selectedProject);

    if (entries.length === 0) {
      alert("Không có dữ liệu để xuất.");
      return;
    }

    const projectName = allProjects ? "Tất cả dự án" : (entries[0]?.projectName || selectedProject);

    const exportData = entries.map((e, index) => {
      const history = e.statusHistory || [];
      const getPhaseHistory = (phaseName: string) => {
        return history
          .filter(h => h.includes(`${phaseName}:`))
          .map(h => h.split(' - ').slice(0, 1).join(' ') + ' - ' + (h.includes(': ') ? h.split(': ').pop() : h.split(' - ').pop()))
          .join('\n');
      };

      return {
        'STT': index + 1,
        'Dự Án': e.projectName,
        'Mã DA': e.projectCode,
        'Cụm': e.cluster || '',
        'Module': e.moduleCode || '',
        'Số Lượng': e.quantity || 0,
        'Giao Nhận': getPhaseHistory('Giao Nhận'),
        'Nguội - Sơn': getPhaseHistory('Nguội - Sơn'),
        'Lắp Ráp': getPhaseHistory('Lắp Ráp'),
        'Đóng Gói': getPhaseHistory('Đóng Gói'),
        'Giao Xe': getPhaseHistory('Giao Xe'),
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    
    // Auto-size columns (rough approximation)
    const wscols = [
      { wch: 5 },  // STT
      { wch: 20 }, // Du An
      { wch: 15 }, // Ma DA
      { wch: 15 }, // Cụm
      { wch: 20 }, // Module
      { wch: 10 }, // SL
      { wch: 30 }, // Giao Nhan
      { wch: 30 }, // Nguoi - Son
      { wch: 30 }, // Lap Rap
      { wch: 30 }, // Dong Goi
      { wch: 30 }, // Giao Xe
    ];
    worksheet['!cols'] = wscols;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, allProjects ? "Toàn bộ dữ liệu" : "Dữ liệu dự án");
    
    const fileName = allProjects ? `Bao_cao_tong_hop.xlsx` : `Bao_cao_${projectName}_${selectedProject}.xlsx`;
    XLSX.writeFile(workbook, fileName);
    setShowExtraMenu(false);
  };

  useEffect(() => {
    if (!user) return;

    const qItems = query(collection(db, 'items'), orderBy('createdAt', 'desc'));
    const unsubItems = onSnapshot(qItems, (snapshot) => {
      setItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StockItem)));
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'items');
    });

    const qProjects = query(collection(db, 'projects'), orderBy('createdAt', 'asc'));
    const unsubProjects = onSnapshot(qProjects, (snapshot) => {
      setProjectEntries(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProjectEntry)));
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'projects');
    });

    return () => {
      unsubItems();
      unsubProjects();
    };
  }, [user]);

  // Reset selection when project or tab changes
  useEffect(() => {
    setIsSelectMode(false);
    setSelectedModuleIds([]);
  }, [selectedProject, activeTab]);

  const isPrivileged = role === 'admin' || role === 'mod';

  // Find entries for current selected project
  const currentProjectEntries = selectedProject 
    ? projectEntries.filter(p => p.projectCode === selectedProject) 
    : [];

  return (
    <div className="min-h-screen bg-[#f4f6f9] flex flex-col font-sans" id="main-screen">
      {/* Navbar - AdminLTE Style */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-20 shadow-sm" id="app-header">
        <div className="flex items-center space-x-3" id="header-logo">
          <div className="w-8 h-8 bg-primary rounded flex items-center justify-center text-white shadow-sm">
            <Package size={18} />
          </div>
          <span className="font-bold text-lg tracking-tight text-gray-800 hidden sm:inline">ADMINLTE STOCK</span>
          {isPrivileged && (
            <span className="ml-2 px-2 py-0.5 bg-yellow-100 text-yellow-800 text-[10px] font-bold rounded-full uppercase">
              {role}
            </span>
          )}
        </div>
        
        <div className="flex items-center space-x-3" id="header-actions">
          <div className="flex items-center space-x-2 px-2 py-1 rounded hover:bg-gray-100 transition-colors cursor-pointer" id="user-profile-nav">
            <img 
              src={user?.photoURL || ''} 
              alt={user?.displayName || 'User'} 
              referrerPolicy="no-referrer" 
              className="w-8 h-8 rounded-full border border-gray-200"
            />
            <span className="text-sm font-semibold text-gray-700 hidden xs:inline">{user?.displayName?.split(' ')[0]}</span>
          </div>
          <button 
            onClick={logout}
            className="p-2 text-gray-400 hover:text-red-500 transition-colors"
            title="Đăng xuất"
            id="logout-btn"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* AdminLTE Content Layout */}
      <main className="flex-1 p-4 sm:p-6" id="app-content">
        <AnimatePresence mode="wait">
          {activeTab === 'management' && (
            <ManagementScreen 
              key="management" 
              items={items} 
              projectEntries={projectEntries} 
              selectedProject={selectedProject}
              setSelectedProject={setSelectedProject}
              loading={loading}
              isSelectMode={isSelectMode}
              setIsSelectMode={setIsSelectMode}
              selectedModuleIds={selectedModuleIds}
              setSelectedModuleIds={setSelectedModuleIds}
              showBulkModal={showBulkModal}
              setShowBulkModal={setShowBulkModal}
            />
          )}
          {activeTab === 'timeline' && <TimelineScreen key="timeline" />}
          {activeTab === 'excel' && <ExcelImportScreen key="excel" onComplete={() => setActiveTab('management')} />}
          {activeTab === 'edit' && (
            <EditProjectScreen 
              key="edit" 
              initialProjectCode={selectedProject} 
              projectEntries={projectEntries}
              onComplete={() => setActiveTab('management')} 
            />
          )}
        </AnimatePresence>
      </main>

      {/* Bottom Navigation */}
      <nav className="bg-white border-t border-gray-200 flex justify-around items-stretch sticky bottom-0 z-20 shadow-lg h-16" id="bottom-nav">
        {isPrivileged && (
          <div className="flex-1 relative flex flex-col items-center justify-center">
            <button 
              onClick={() => setShowExtraMenu(!showExtraMenu)}
              className={`w-full h-full flex flex-col items-center justify-center space-y-1 transition-all border-t-4 ${showExtraMenu || activeTab === 'timeline' || activeTab === 'excel' ? 'border-primary text-primary bg-blue-50/20' : 'border-transparent text-gray-400'}`}
              id="nav-extra-menu"
            >
              <Menu size={20} />
              <span className="text-[10px] font-bold uppercase tracking-tight">Menu</span>
            </button>

            <AnimatePresence>
              {showExtraMenu && (
                <>
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setShowExtraMenu(false)}
                  ></div>
                  <motion.div 
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute bottom-20 left-4 w-56 bg-white rounded-xl shadow-2xl border border-gray-100 py-2 z-50 overflow-hidden"
                  >
                    <button 
                      onClick={() => { setActiveTab('timeline'); setShowExtraMenu(false); }}
                      className="w-full px-4 py-3 flex items-center space-x-3 hover:bg-gray-50 transition-colors"
                    >
                      <Clock size={18} className="text-info" />
                      <span className="text-xs font-bold text-gray-700 uppercase">Timeline</span>
                    </button>
                    <div className="border-t border-gray-50 my-1"></div>
                    <button 
                      onClick={() => { setActiveTab('excel'); setShowExtraMenu(false); }}
                      className="w-full px-4 py-3 flex items-center space-x-3 hover:bg-gray-50 transition-colors"
                    >
                      <Upload size={18} className="text-success" />
                      <span className="text-xs font-bold text-gray-700 uppercase">Nhập Excel</span>
                    </button>
                    <button 
                      onClick={() => exportToExcel(false)}
                      className={`w-full px-4 py-3 flex items-center space-x-3 hover:bg-gray-50 transition-colors ${!selectedProject ? 'opacity-50 grayscale' : ''}`}
                    >
                      <Download size={18} className="text-primary" />
                      <span className="text-xs font-bold text-gray-700 uppercase">Xuất DA {selectedProject || '(?)'}</span>
                    </button>
                    <button 
                      onClick={() => exportToExcel(true)}
                      className="w-full px-4 py-3 flex items-center space-x-3 hover:bg-gray-50 transition-colors border-t border-gray-50"
                    >
                      <FileSpreadsheet size={18} className="text-danger" />
                      <span className="text-xs font-bold text-gray-700 uppercase">Xuất TẤT CẢ DA</span>
                    </button>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        )}

        <button 
          onClick={() => setActiveTab('management')}
          className={`flex-1 flex flex-col items-center justify-center space-y-1 transition-all border-t-4 ${activeTab === 'management' ? 'border-primary text-primary bg-blue-50/20' : 'border-transparent text-gray-400'}`} 
          id="nav-management"
        >
          <BarChart3 size={20} />
          <span className="text-[10px] font-bold uppercase tracking-tight">Quản Lý</span>
        </button>

        {isPrivileged && (
          <>
            {/* Contextual Update / Select Multiple Button */}
            {selectedProject && activeTab === 'management' ? (
              <button 
                onClick={
                  isSelectMode 
                    ? (selectedModuleIds.length > 0 ? () => setShowBulkModal(true) : () => setIsSelectMode(false))
                    : () => setIsSelectMode(true)
                }
                className={`flex-1 flex flex-col items-center justify-center space-y-1 transition-all border-t-4 ${isSelectMode ? (selectedModuleIds.length > 0 ? 'border-success text-success bg-green-50/20' : 'border-danger text-danger bg-red-50/20') : 'border-transparent text-gray-400'}`} 
                id="nav-context-action"
              >
                {isSelectMode ? (
                  selectedModuleIds.length > 0 ? <Upload size={20} className="animate-bounce" /> : <X size={20} />
                ) : (
                  <PlusCircle size={20} />
                )}
                <span className="text-[10px] font-bold uppercase tracking-tight">
                  {isSelectMode 
                    ? (selectedModuleIds.length > 0 ? `LƯU ${selectedModuleIds.length} M` : 'HỦY CHỌN') 
                    : 'CHỌN NHIỀU'
                  }
                </span>
              </button>
            ) : (
              <button 
                onClick={() => setActiveTab('edit')}
                className={`flex-1 flex flex-col items-center justify-center space-y-1 transition-all border-t-4 ${activeTab === 'edit' ? 'border-primary text-primary bg-blue-50/20' : 'border-transparent text-gray-400'}`} 
                id="nav-edit"
              >
                <PlusCircle size={20} />
                <span className="text-[10px] font-bold uppercase tracking-tight">Cập Nhật</span>
              </button>
            )}
          </>
        )}
      </nav>
    </div>
  );
}

function LoginScreen() {
  const { login } = useAuth();

  return (
    <div className="min-h-screen bg-[#e9ecef] flex flex-col items-center justify-center p-6 font-sans" id="login-screen">
      <div className="w-full max-w-sm" id="login-box">
        <div className="mb-6 text-center" id="login-logo">
          <div className="flex items-center justify-center space-x-2 text-3xl font-light text-gray-800">
             <span className="font-bold">Admin</span>LTE
          </div>
        </div>
        
        <div className="bg-white rounded shadow-md border-t-4 border-primary overflow-hidden" id="login-card">
          <div className="p-8 space-y-6">
            <div className="text-center space-y-2">
              <p className="text-gray-600 text-sm">Chào mừng quay trở lại. Hãy đăng nhập để tiếp tục quản lý kho hàng.</p>
            </div>

            <button
              onClick={login}
              className="w-full bg-[#df4b3b] hover:bg-[#c9302c] text-white font-semibold py-3 px-4 rounded flex items-center justify-center space-x-3 transition-all active:scale-[0.98] shadow-sm uppercase text-xs tracking-wider"
              id="google-login-btn"
            >
              <LogIn size={18} />
              <span>Đăng nhập với Google</span>
            </button>

            <div className="relative py-2 flex items-center justify-center">
              <div className="flex-grow border-t border-gray-100"></div>
              <span className="px-3 text-[10px] text-gray-400 font-bold">THÔNG TIN</span>
              <div className="flex-grow border-t border-gray-100"></div>
            </div>

            <p className="text-[11px] text-gray-400 text-center leading-relaxed italic">
              Bằng việc đăng nhập, hệ thống sẽ tự động đồng bộ kho hàng của bạn với Google Firebase.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F3F4F6] flex items-center justify-center" id="loading-screen">
        <motion.div 
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
          className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-xl"
          id="loading-logo"
        >
          <Package size={24} />
        </motion.div>
      </div>
    );
  }

  return user ? <MainScreen /> : <LoginScreen />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
