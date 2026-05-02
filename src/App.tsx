import React, { useState, useEffect, useMemo } from 'react';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  User 
} from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp, 
  orderBy, 
  limit,
  setDoc,
  getDocs
} from 'firebase/firestore';
import { auth, db } from './lib/firebase';
import { OperationType, handleFirestoreError } from './lib/error-handler';
import { formatCurrency, cn } from './lib/utils';
import { 
  LayoutDashboard, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Wallet, 
  Plus, 
  LogOut, 
  History, 
  PieChart, 
  Settings,
  ChevronRight,
  TrendingDown,
  TrendingUp,
  Filter,
  Trash2,
  Edit2,
  X,
  Menu,
  Bell,
  User as UserIcon,
  AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Filler
} from 'chart.js';
import { Pie, Line } from 'react-chartjs-2';
import { format, startOfMonth, endOfMonth, isWithinInterval, parseISO } from 'date-fns';

ChartJS.register(
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Filler
);

// Types
interface Transaction {
  id: string;
  userId: string;
  type: 'income' | 'expense';
  amount: number;
  category: string;
  date: string;
  note: string;
  createdAt: any;
}

interface Budget {
  id: string;
  userId: string;
  category: string;
  amount: number;
}

type View = 'dashboard' | 'transactions' | 'budget';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  // Modal State
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [modalType, setModalType] = useState<'income' | 'expense'>('expense');

  // Data State
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [globalError, setGlobalError] = useState<{ message: string, url?: string } | null>(null);
  
  // Auth state listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Firestore listeners
  useEffect(() => {
    if (!user) return;

    const tQuery = query(
      collection(db, 'transactions'), 
      where('userId', '==', user.uid)
      // orderBy removed temporarily to avoid index requirement during debugging
    );
    
    const unsubscribeT = onSnapshot(tQuery, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));
      setTransactions(data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    }, (err) => {
      console.error("Transactions sync error:", err);
      console.log("Current User UID:", user.uid);
      setGlobalError({ 
        message: `Gagal memuat transaksi: ${err.message}`,
        url: err.message.match(/https[^\s]+/)?.[0]
      });
    });

    const bQuery = query(
      collection(db, 'budgets'), 
      where('userId', '==', user.uid)
    );
    
    const unsubscribeB = onSnapshot(bQuery, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Budget));
      setBudgets(data);
    }, (err) => {
      console.error("Budgets sync error:", err);
      console.log("Current User UID:", user.uid);
      setGlobalError({ message: `Gagal memuat anggaran: ${err.message}` });
    });

    return () => {
      unsubscribeT();
      unsubscribeB();
    };
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-12 h-12 border-4 border-primary-600 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 flex">
      {/* Global Error Banner */}
      <AnimatePresence>
        {globalError && (
          <motion.div 
            initial={{ y: -100 }}
            animate={{ y: 0 }}
            exit={{ y: -100 }}
            className="fixed top-0 inset-x-0 z-[100] bg-red-600 text-white p-4 text-center shadow-xl flex items-center justify-center gap-4"
          >
            <AlertTriangle size={20} />
            <div className="text-sm font-bold">
              {globalError.message} 
              {globalError.url && (
                <a href={globalError.url} target="_blank" rel="noreferrer" className="ml-2 underline decoration-white/50 hover:decoration-white">
                  Klik di sini untuk membuat Index
                </a>
              )}
            </div>
            <button onClick={() => setGlobalError(null)} className="p-1 hover:bg-white/20 rounded">
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile Sidebar Toggle */}
      <div className="lg:hidden fixed top-4 left-4 z-50">
        <button 
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="p-2 bg-white rounded-lg shadow-md hover:bg-slate-50"
        >
          {isSidebarOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Sidebar for Desktop */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-40 w-72 bg-white border-r border-slate-200 transition-transform lg:relative lg:translate-x-0 shadow-sm",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="h-full flex flex-col p-6">
          <div className="flex items-center gap-3 mb-12 px-2">
            <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-primary-600/30">
              <Wallet size={24} />
            </div>
            <h1 className="text-xl font-black tracking-tighter text-slate-800">SIMANDU</h1>
          </div>

          <nav className="flex-1 space-y-2">
            <SidebarItem 
              active={view === 'dashboard'} 
              icon={<LayoutDashboard size={20} />} 
              label="Home" 
              onClick={() => { setView('dashboard'); setIsSidebarOpen(false); }} 
            />
            <SidebarItem 
              active={view === 'transactions'} 
              icon={<History size={20} />} 
              label="Transaksi" 
              onClick={() => { setView('transactions'); setIsSidebarOpen(false); }} 
            />
            <SidebarItem 
              active={view === 'budget'} 
              icon={<TrendingDown size={20} />} 
              label="Anggaran" 
              onClick={() => { setView('budget'); setIsSidebarOpen(false); }} 
            />
          </nav>

          <div className="pt-6 border-t border-slate-100">
            <button 
              onClick={() => signOut(auth)}
              className="w-full flex items-center gap-3 px-4 py-3 text-slate-500 hover:text-expense hover:bg-red-50 rounded-xl transition-all"
            >
              <LogOut size={20} />
              <span className="font-bold">Logout</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0 h-screen overflow-y-auto pb-32 lg:pb-10">
        <header className="px-6 py-10 lg:px-10 bg-gradient-to-br from-primary-600 to-primary-700 text-white rounded-b-[40px] shadow-2xl shadow-primary-600/20 mb-8 relative overflow-hidden">
          {/* Background Orbs */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl translate-x-1/2 -translate-y-1/2"></div>
          
          <div className="flex items-center justify-between relative z-10">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full border-4 border-white/30 p-1 bg-white/10">
                <div className="w-full h-full rounded-full bg-slate-200 flex items-center justify-center text-primary-700 overflow-hidden">
                  <UserIcon size={32} />
                </div>
              </div>
              <div>
                <p className="text-white/70 text-sm font-medium uppercase tracking-widest">Selamat Datang,</p>
                <h2 className="text-2xl font-black">{user.email?.split('@')[0] || 'User'}</h2>
                <p className="text-white/60 text-xs italic">Personal Finance Manager • SIMANDU</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button className="p-3 bg-white/20 rounded-2xl backdrop-blur-md hover:bg-white/30 transition-all">
                <Bell size={20} />
              </button>
            </div>
          </div>
        </header>

        <div className="px-6 lg:px-10">
          <AnimatePresence mode="wait">
            {view === 'dashboard' && (
              <DashboardView 
                key="dash" 
                transactions={transactions} 
                budgets={budgets} 
                userId={user.uid} 
                onOpenTransactionModal={(type) => {
                  setEditingTransaction(null);
                  setModalType(type);
                  setIsTransactionModalOpen(true);
                }}
              />
            )}
            {view === 'transactions' && (
              <TransactionsView 
                key="trans" 
                transactions={transactions} 
                userId={user.uid}
                onEditTransaction={(t) => {
                  setEditingTransaction(t);
                  setModalType(t ? t.type : 'expense');
                  setIsTransactionModalOpen(true);
                }}
              />
            )}
            {view === 'budget' && (
              <BudgetView 
                key="budget" 
                transactions={transactions} 
                budgets={budgets} 
                userId={user.uid}
                onEditBudget={(b) => {
                  setEditingBudget(b);
                  setIsBudgetModalOpen(true);
                }}
              />
            )}
          </AnimatePresence>
        </div>

        {/* Global Modals */}
        <AnimatePresence>
          {isTransactionModalOpen && (
            <TransactionModal 
              onClose={() => setIsTransactionModalOpen(false)} 
              userId={user.uid} 
              editingTransaction={editingTransaction}
              defaultType={modalType}
            />
          )}
          {isBudgetModalOpen && (
            <BudgetModal 
              onClose={() => setIsBudgetModalOpen(false)} 
              userId={user.uid} 
              editingBudget={editingBudget}
            />
          )}
        </AnimatePresence>
      </main>

      {/* Bottom Nav for Mobile - SIMANDU Style */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 px-6 py-4 flex items-center justify-between z-40 rounded-t-[32px] shadow-[0_-10px_40px_rgba(0,0,0,0.05)]">
        <NavButton active={view === 'dashboard'} icon={<LayoutDashboard size={20} />} label="Home" onClick={() => setView('dashboard')} />
        
        {/* Floating Center Button */}
        <div className="relative -top-12">
          <button 
            onClick={() => setView('transactions')}
            className="w-16 h-16 bg-primary-600 rounded-full flex items-center justify-center text-white shadow-2xl shadow-primary-600/40 border-4 border-white"
          >
            <Plus size={32} />
          </button>
        </div>

        <NavButton active={view === 'budget'} icon={<TrendingDown size={20} />} label="Budget" onClick={() => setView('budget')} />
      </div>
    </div>
  );
}

function NavButton({ active, icon, label, onClick }: { active: boolean, icon: React.ReactNode, label: string, onClick: () => void }) {
  return (
    <button onClick={onClick} className={cn(
      "flex flex-col items-center gap-1 transition-all",
      active ? "text-primary-600 scale-110" : "text-slate-400"
    )}>
      {icon}
      <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
    </button>
  );
}
// Components
function SidebarItem({ active, icon, label, onClick }: { active: boolean, icon: React.ReactNode, label: string, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium",
        active 
          ? "bg-primary-600 text-white shadow-lg shadow-primary-600/20" 
          : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
      )}
    >
      {icon}
      <span>{label}</span>
      {active && <ChevronRight size={16} className="ml-auto opacity-70" />}
    </button>
  );
}

// --- Views ---

function DashboardView({ 
  transactions, 
  budgets, 
  userId, 
  onOpenTransactionModal 
}: { 
  transactions: Transaction[], 
  budgets: Budget[], 
  userId: string,
  onOpenTransactionModal: (type: 'income' | 'expense') => void
}) {
  const currentMonth = startOfMonth(new Date());
  
  const stats = useMemo(() => {
    let income = 0;
    let expense = 0;
    
    const monthTransactions = transactions.filter(t => isWithinInterval(parseISO(t.date), {
      start: startOfMonth(new Date()),
      end: endOfMonth(new Date())
    }));

    monthTransactions.forEach(t => {
      if (t.type === 'income') income += t.amount;
      else expense += t.amount;
    });

    const totalBalance = transactions.reduce((acc, t) => {
      return t.type === 'income' ? acc + t.amount : acc - t.amount;
    }, 0);

    return { income, expense, totalBalance };
  }, [transactions]);

  // Chart data
  const pieData = useMemo(() => {
    const categories: Record<string, number> = {};
    const monthExpenses = transactions.filter(t => 
      t.type === 'expense' && 
      isWithinInterval(parseISO(t.date), { start: currentMonth, end: endOfMonth(new Date()) })
    );

    monthExpenses.forEach(t => {
      categories[t.category] = (categories[t.category] || 0) + t.amount;
    });

    return {
      labels: Object.keys(categories),
      datasets: [{
        data: Object.values(categories),
        backgroundColor: [
          '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#8b5cf6'
        ],
        borderWidth: 0,
      }]
    };
  }, [transactions]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-8"
    >
      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard 
          title="Total Saldo" 
          amount={stats.totalBalance} 
          icon={<Plus size={24} />} 
          variant="blue" 
          subtitle="Saldo Tersedia"
        />
        <StatCard 
          title="Pemasukan" 
          amount={stats.income} 
          icon={<TrendingUp size={24} />} 
          variant="green" 
          subtitle="Bulan Ini"
        />
        <StatCard 
          title="Pengeluaran" 
          amount={stats.expense} 
          icon={<TrendingDown size={24} />} 
          variant="red" 
          subtitle="Bulan Ini"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Recent Transactions */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold">Transaksi Terbaru</h3>
            <button className="text-primary-600 text-sm font-medium hover:underline">Lihat Semua</button>
          </div>
          <div className="space-y-4">
            {transactions.slice(0, 5).map(t => (
              <div key={t.id} className="flex items-center gap-4 p-3 hover:bg-slate-50 rounded-2xl transition-colors">
                <div className={cn(
                  "w-12 h-12 rounded-2xl flex items-center justify-center",
                  t.type === 'income' ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"
                )}>
                  {t.type === 'income' ? <ArrowUpRight size={20} /> : <ArrowDownLeft size={20} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{t.category}</p>
                  <p className="text-xs text-slate-500">{format(parseISO(t.date), 'dd MMM yyyy')}</p>
                </div>
                <p className={cn(
                  "font-bold",
                  t.type === 'income' ? "text-green-600" : "text-red-600"
                )}>
                  {t.type === 'income' ? '+' : '-'}{formatCurrency(t.amount)}
                </p>
              </div>
            ))}
            {transactions.length === 0 && (
              <div className="text-center py-10 text-slate-400">
                Belum ada transaksi
              </div>
            )}
          </div>
        </div>

        {/* Expense Overview Pie */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-bold mb-6">Distribusi Pengeluaran</h3>
          {pieData.labels.length > 0 ? (
            <div className="h-64 flex items-center justify-center">
              <Pie 
                data={pieData} 
                options={{
                  plugins: { legend: { position: 'right' } },
                  maintainAspectRatio: false
                }} 
              />
            </div>
          ) : (
            <div className="h-64 flex flex-col items-center justify-center text-slate-400 space-y-2">
              <PieChart size={48} className="opacity-20" />
              <p>Belum ada data pengeluaran</p>
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <QuickActionFAB onAdd={(type) => onOpenTransactionModal(type)} />
    </motion.div>
  );
}

function TransactionsView({ 
  transactions, 
  userId,
  onEditTransaction
}: { 
  transactions: Transaction[], 
  userId: string,
  onEditTransaction: (t: Transaction | null) => void
}) {
  const handleDelete = async (id: string) => {
    if (!window.confirm('Hapus transaksi ini?')) return;
    try {
      await deleteDoc(doc(db, 'transactions', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `transactions/${id}`);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="flex items-center justify-between mb-6">
          <div className="flex gap-2">
            <button className="flex items-center gap-2 px-4 py-2 bg-slate-50 rounded-lg text-sm font-medium text-slate-600">
              <Filter size={16} /> Filter
            </button>
          </div>
          <button 
            onClick={() => onEditTransaction(null)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-bold shadow-md shadow-primary-600/20"
          >
            <Plus size={16} /> Tambah Transaksi
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-50">
                <th className="pb-4 font-semibold text-slate-500 px-2">Tanggal</th>
                <th className="pb-4 font-semibold text-slate-500 px-2">Kategori</th>
                <th className="pb-4 font-semibold text-slate-500 px-2">Catatan</th>
                <th className="pb-4 font-semibold text-slate-500 px-2">Jumlah</th>
                <th className="pb-4 font-semibold text-slate-500 px-2 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {transactions.map(t => (
                <tr key={t.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="py-4 text-sm px-2">{format(parseISO(t.date), 'dd MMM yyyy')}</td>
                  <td className="py-4 px-2">
                    <span className="px-3 py-1 bg-slate-100 rounded-full text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      {t.category}
                    </span>
                  </td>
                  <td className="py-4 text-sm text-slate-500 px-2 truncate max-w-[200px]">{t.note || '-'}</td>
                  <td className={cn(
                    "py-4 font-bold px-2",
                    t.type === 'income' ? "text-green-600" : "text-red-600"
                  )}>
                    {t.type === 'income' ? '+' : '-'}{formatCurrency(t.amount)}
                  </td>
                  <td className="py-4 text-right px-2">
                    <div className="flex items-center justify-end gap-2">
                      <button 
                        onClick={() => onEditTransaction(t)}
                        className="p-2 text-slate-400 hover:text-primary-600 transition-colors"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button 
                        onClick={() => handleDelete(t.id)}
                        className="p-2 text-slate-400 hover:text-expense transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {transactions.length === 0 && (
            <div className="p-12 text-center text-slate-400">
              Belum ada riwayat transaksi
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function BudgetView({ 
  transactions, 
  budgets, 
  userId,
  onEditBudget
}: { 
  transactions: Transaction[], 
  budgets: Budget[], 
  userId: string,
  onEditBudget: (b: Budget | null) => void
}) {
  const budgetProgress = useMemo(() => {
    const currentMonth = startOfMonth(new Date());
    const monthlyExpenses = transactions.filter(t => 
      t.type === 'expense' && 
      isWithinInterval(parseISO(t.date), { start: currentMonth, end: endOfMonth(new Date()) })
    );

    return budgets.map(b => {
      const spent = monthlyExpenses
        .filter(t => t.category.toLowerCase() === b.category.toLowerCase())
        .reduce((sum, t) => sum + t.amount, 0);
      
      const percent = (spent / b.amount) * 100;
      return { ...b, spent, percent };
    });
  }, [transactions, budgets]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-6"
    >
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-bold">Anggaran Kategori</h3>
        <button 
          onClick={() => onEditBudget(null)}
          className="flex items-center gap-2 px-6 py-2.5 bg-primary-600 text-white rounded-2xl font-bold shadow-lg shadow-primary-600/20"
        >
          <Plus size={18} /> Atur Budget
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {budgetProgress.map(b => (
          <div key={b.id} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col gap-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-bold text-lg text-slate-800">{b.category}</p>
                <p className="text-sm text-slate-500">Bulan ini</p>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => onEditBudget(b)}
                  className="p-2 text-slate-300 hover:text-primary-600"
                >
                  <Edit2 size={16} />
                </button>
                <button 
                  onClick={async () => {
                    if (confirm('Hapus budget ini?')) {
                      await deleteDoc(doc(db, 'budgets', b.id));
                    }
                  }}
                  className="p-2 text-slate-300 hover:text-expense"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="font-medium text-slate-600">Progres: {Math.min(100, Math.round(b.percent))}%</span>
                <span>{formatCurrency(b.spent)} / {formatCurrency(b.amount)}</span>
              </div>
              <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, b.percent)}%` }}
                  className={cn(
                    "h-full rounded-full transition-all duration-1000",
                    b.percent > 100 ? "bg-red-500" : b.percent > 80 ? "bg-amber-500" : "bg-primary-600"
                  )}
                />
              </div>
            </div>

            {b.percent > 100 && (
              <div className="flex items-center gap-2 p-3 bg-red-50 text-red-600 rounded-xl text-sm font-medium">
                <AlertTriangle size={16} />
                <span>Over budget! Segera tinjau pengeluaran Anda.</span>
              </div>
            )}
            {b.percent > 80 && b.percent <= 100 && (
              <div className="flex items-center gap-2 p-3 bg-amber-50 text-amber-600 rounded-xl text-sm font-medium">
                <AlertTriangle size={16} />
                <span>Mendekati limit budget.</span>
              </div>
            )}
          </div>
        ))}
        {budgets.length === 0 && (
          <div className="md:col-span-2 text-center py-20 bg-white rounded-3xl border-2 border-dashed border-slate-200 text-slate-400">
            <PieChart size={48} className="mx-auto mb-4 opacity-10" />
            <p className="font-medium">Belum ada anggaran yang diatur.</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// --- Modals & UI Fragments ---

function StatCard({ title, amount, icon, variant, subtitle }: { title: string, amount: number, icon: React.ReactNode, variant: 'blue' | 'red' | 'green', subtitle?: string }) {
  const styles = {
    blue: "bg-primary-600 text-white shadow-primary-600/30",
    red: "bg-expense text-white shadow-red-500/30",
    green: "bg-income text-white shadow-green-500/30"
  };

  return (
    <div className={cn("p-6 rounded-[32px] shadow-xl relative overflow-hidden group border border-white/10", styles[variant])}>
      <div className="absolute -top-12 -right-12 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:bg-white/20 transition-all"></div>
      <div className="relative z-10">
        <p className="text-white/60 text-xs font-bold uppercase tracking-widest mb-1">{title}</p>
        <p className="text-3xl font-black tracking-tight mb-4">{formatCurrency(amount)}</p>
        
        <div className="flex items-center justify-between pt-4 border-t border-white/10">
          <p className="text-white/60 text-[10px] font-bold uppercase tracking-widest">{subtitle}</p>
          <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center">
            {icon}
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickActionFAB({ onAdd }: { onAdd: (type: 'income' | 'expense') => void }) {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <div className="fixed bottom-8 right-8 z-40">
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.5, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.5, y: 20 }}
            className="absolute bottom-20 right-0 flex flex-col gap-3 items-end"
          >
            <ActionButton label="Pemasukan" onClick={() => { onAdd('income'); setIsOpen(false); }} />
            <ActionButton label="Pengeluaran" onClick={() => { onAdd('expense'); setIsOpen(false); }} />
          </motion.div>
        )}
      </AnimatePresence>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-16 h-16 bg-primary-600 rounded-full flex items-center justify-center text-white shadow-2xl shadow-primary-600/40 hover:scale-110 active:scale-95 transition-all"
      >
        {isOpen ? <X /> : <Plus size={32} />}
      </button>
    </div>
  );
}

function ActionButton({ label, onClick }: { label: string, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="px-6 py-3 bg-white text-slate-800 rounded-2xl shadow-xl border border-slate-100 font-bold hover:bg-slate-50 transition-all whitespace-nowrap"
    >
      {label}
    </button>
  );
}

function TransactionModal({ 
  onClose, 
  userId, 
  editingTransaction,
  defaultType = 'expense'
}: { 
  onClose: () => void, 
  userId: string, 
  editingTransaction: Transaction | null,
  defaultType?: 'income' | 'expense'
}) {
  const [type, setType] = useState<'income' | 'expense'>(editingTransaction?.type || defaultType);
  const [formData, setFormData] = useState({
    amount: editingTransaction?.amount.toString() || '',
    category: editingTransaction?.category || '',
    date: editingTransaction?.date || format(new Date(), 'yyyy-MM-dd'),
    note: editingTransaction?.note || ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        userId,
        type,
        amount: Number(formData.amount),
        category: formData.category,
        date: formData.date,
        note: formData.note,
        createdAt: serverTimestamp()
      };

      if (editingTransaction) {
        await updateDoc(doc(db, 'transactions', editingTransaction.id), {
          ...payload,
          createdAt: editingTransaction.createdAt // Keep original
        });
      } else {
        await addDoc(collection(db, 'transactions'), payload);
      }
      onClose();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'transactions');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white w-full max-w-lg rounded-[2rem] overflow-hidden shadow-2xl"
      >
        <div className="p-8">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-2xl font-bold">{editingTransaction ? 'Edit Transaksi' : 'Transaksi Baru'}</h2>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X /></button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="flex p-1 bg-slate-100 rounded-2xl">
              <button 
                type="button"
                onClick={() => setType('income')}
                className={cn("flex-1 py-3 rounded-xl font-bold transition-all", type === 'income' ? "bg-white text-green-600 shadow-sm" : "text-slate-500")}
              >Pemasukan</button>
              <button 
                type="button"
                onClick={() => setType('expense')}
                className={cn("flex-1 py-3 rounded-xl font-bold transition-all", type === 'expense' ? "bg-white text-red-600 shadow-sm" : "text-slate-500")}
              >Pengeluaran</button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-500 mb-2">Jumlah (Rp)</label>
                <input 
                  type="number" 
                  autoFocus
                  required
                  value={formData.amount}
                  onChange={e => setFormData({...formData, amount: e.target.value})}
                  className="w-full px-6 py-4 bg-slate-50 border-2 border-transparent focus:border-primary-600 rounded-2xl outline-none text-xl font-bold transition-all" 
                  placeholder="0"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-500 mb-2">Kategori</label>
                  <div className="flex gap-2">
                    <select 
                      required
                      value={formData.category}
                      onChange={e => setFormData({...formData, category: e.target.value})}
                      className="flex-1 px-4 py-4 bg-slate-50 border-2 border-transparent focus:border-primary-600 rounded-2xl outline-none font-medium"
                    >
                      <option value="">Pilih Kategori</option>
                      <option value="Makanan">Makanan</option>
                      <option value="Gaji">Gaji</option>
                      <option value="Transport">Transport</option>
                      <option value="Hiburan">Hiburan</option>
                      <option value="Kesehatan">Kesehatan</option>
                      <option value="Belanja">Belanja</option>
                      <option value="Investasi">Investasi</option>
                      <option value="Kebutuhan">Kebutuhan</option>
                      {formData.category && !["Makanan", "Gaji", "Transport", "Hiburan", "Kesehatan", "Belanja", "Investasi", "Kebutuhan"].includes(formData.category) && (
                        <option value={formData.category}>{formData.category}</option>
                      )}
                      <option value="custom">+ Tambah Baru</option>
                    </select>
                    {formData.category === 'custom' && (
                      <input 
                        type="text"
                        placeholder="Nama Kategori"
                        autoFocus
                        onBlur={e => {
                          if (e.target.value) setFormData({...formData, category: e.target.value});
                          else setFormData({...formData, category: ''});
                        }}
                        className="flex-1 px-4 py-4 bg-slate-50 border-2 border-primary-600 rounded-2xl outline-none font-medium"
                      />
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-500 mb-2">Tanggal</label>
                  <input 
                    type="date" 
                    required
                    value={formData.date}
                    onChange={e => setFormData({...formData, date: e.target.value})}
                    className="w-full px-4 py-4 bg-slate-50 border-2 border-transparent focus:border-primary-600 rounded-2xl outline-none font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-500 mb-2">Catatan (Opsional)</label>
                <textarea 
                  value={formData.note}
                  onChange={e => setFormData({...formData, note: e.target.value})}
                  className="w-full px-6 py-4 bg-slate-50 border-2 border-transparent focus:border-primary-600 rounded-2xl outline-none font-medium min-h-[100px] resize-none"
                  placeholder="Tambahkan detail..."
                />
              </div>
            </div>

            <button type="submit" className="w-full py-5 bg-primary-600 text-white rounded-3xl font-black text-lg shadow-xl shadow-primary-600/30 hover:scale-[1.02] active:scale-95 transition-all">
              SIMPAN DATA
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}

function BudgetModal({ onClose, userId, editingBudget }: { onClose: () => void, userId: string, editingBudget: Budget | null }) {
  const [formData, setFormData] = useState({
    amount: editingBudget?.amount.toString() || '',
    category: editingBudget?.category || '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        userId,
        amount: Number(formData.amount),
        category: formData.category,
        createdAt: serverTimestamp()
      };

      if (editingBudget) {
        await updateDoc(doc(db, 'budgets', editingBudget.id), {
          amount: payload.amount,
          category: payload.category
        });
      } else {
        await addDoc(collection(db, 'budgets'), payload);
      }
      onClose();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'budgets');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white w-full max-w-md rounded-[2.5rem] overflow-hidden shadow-2xl"
      >
        <div className="p-10">
          <div className="flex justify-between items-center mb-10">
            <h2 className="text-2xl font-bold">Set Anggaran</h2>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X /></button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-bold text-slate-400 mb-3 ml-2 uppercase tracking-widest">Kategori</label>
                <select 
                  required
                  value={formData.category}
                  onChange={e => setFormData({...formData, category: e.target.value})}
                  className="w-full px-6 py-5 bg-slate-50 border-2 border-transparent focus:border-primary-600 rounded-2xl outline-none font-bold text-lg"
                >
                  <option value="">Pilih Kategori</option>
                  <option value="Makanan">Makanan</option>
                  <option value="Transport">Transport</option>
                  <option value="Hiburan">Hiburan</option>
                  <option value="Kesehatan">Kesehatan</option>
                  <option value="Belanja">Belanja</option>
                  <option value="Investasi">Investasi</option>
                  <option value="Lainnya">Lainnya</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-400 mb-3 ml-2 uppercase tracking-widest">Limit Saldo (Rp)</label>
                <input 
                  type="number" 
                  required
                  value={formData.amount}
                  onChange={e => setFormData({...formData, amount: e.target.value})}
                  className="w-full px-6 py-5 bg-slate-50 border-2 border-transparent focus:border-primary-600 rounded-2xl outline-none text-2xl font-black" 
                  placeholder="Maksimal..."
                />
              </div>
            </div>

            <button type="submit" className="w-full py-5 bg-slate-900 text-white rounded-3xl font-black text-lg shadow-2xl shadow-slate-900/30 hover:scale-[1.02] active:scale-[0.98] transition-all">
              TETAPKAN LIMIT
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}

function AuthScreen() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        const { user } = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, 'users', user.uid), {
          email,
          createdAt: serverTimestamp()
        });
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-primary-600 flex items-center justify-center p-6 relative overflow-hidden">
      {/* Decorative Orbs */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-white/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2"></div>
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-primary-700 rounded-full blur-3xl translate-x-1/3 translate-y-1/3"></div>

      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md bg-white rounded-[40px] p-10 shadow-2xl relative z-10"
      >
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-primary-600 rounded-2xl mx-auto flex items-center justify-center text-white shadow-xl mb-6">
            <Wallet size={32} />
          </div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">SIMANDU</h1>
          <p className="text-slate-500 mt-2 font-medium">Atur keuanganmu lebih cerdas</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-2 uppercase tracking-widest">Alamat Email</label>
            <input 
              type="email" 
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-6 py-4 bg-slate-50 border-2 border-transparent focus:border-primary-600 rounded-2xl outline-none font-semibold transition-all"
              placeholder="user@email.com"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-2 uppercase tracking-widest">Kata Sandi</label>
            <input 
              type="password" 
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-6 py-4 bg-slate-50 border-2 border-transparent focus:border-primary-600 rounded-2xl outline-none font-semibold transition-all"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="p-4 bg-red-50 text-red-600 rounded-2xl text-sm font-medium border border-red-100 italic">
              {error}
            </div>
          )}

          <button 
            type="submit" 
            disabled={loading}
            className="w-full py-5 bg-primary-600 text-white rounded-3xl font-black text-lg shadow-xl shadow-primary-600/30 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            {loading ? 'SABAR YA...' : isLogin ? 'MASUK SEKARANG' : 'DAFTAR AKUN'}
          </button>
        </form>

        <div className="mt-8 text-center">
          <button 
            onClick={() => setIsLogin(!isLogin)}
            className="text-slate-500 font-bold hover:text-primary-600 transition-colors"
          >
            {isLogin ? 'Belum punya akun? Daftar' : 'Sudah punya akun? Masuk'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

