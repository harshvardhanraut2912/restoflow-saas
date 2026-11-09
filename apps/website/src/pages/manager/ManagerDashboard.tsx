import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  UtensilsCrossed, 
  QrCode, 
  ShoppingBag, 
  Users, 
  DollarSign, 
  Award, 
  Plus, 
  Trash2, 
  LogOut, 
  Clock, 
  CheckCircle, 
  ExternalLink,
  Printer,
  X
} from 'lucide-react';
import { managerApi, publicApi, ApiError } from '../../services/api.js';
import { useStaffAuth } from '../../context/StaffAuthContext.js';
import { useTenant } from '../../context/TenantContext.js';
import { ThemeToggle } from '../../components/ThemeToggle.js';

export const ManagerDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout } = useStaffAuth();
  const { restaurant } = useTenant();

  const [activeTab, setActiveTab] = useState<'overview' | 'menu' | 'tables' | 'sales' | 'staff' | 'loyalty'>('overview');

  // Overview / Sales Data
  const [salesData, setSalesData] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);

  // Menu State
  const [categories, setCategories] = useState<any[]>([]);
  const [isAddItemModalOpen, setIsAddItemModalOpen] = useState(false);
  const [isAddCatModalOpen, setIsAddCatModalOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [itemForm, setItemForm] = useState({
    name: '',
    category_id: '',
    description: '',
    base_price_rupees: '',
    image_url: '',
    dietary_type: 'veg',
    preparation_time_minutes: '15',
    variant_name: '',
    variant_price: ''
  });

  // Tables State
  const [tables, setTables] = useState<any[]>([]);
  const [newTableNum, setNewTableNum] = useState('');
  const [newTableCap, setNewTableCap] = useState('4');
  const [activeQrModal, setActiveQrModal] = useState<any>(null);

  // Staff State
  const [staffList, setStaffList] = useState<any[]>([]);
  const [isAddStaffModalOpen, setIsAddStaffModalOpen] = useState(false);
  const [staffForm, setStaffForm] = useState({
    full_name: '',
    email: '',
    password: '',
    role: 'waiter'
  });

  // Loyalty State
  const [customers, setCustomers] = useState<any[]>([]);
  const [loyaltyLedger, setLoyaltyLedger] = useState<any[]>([]);

  const handleAuthError = (err: any) => {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      navigate('/s/login');
      return true;
    }
    return false;
  };

  const loadMenu = async () => {
    try {
      const data = await publicApi.getMenu();
      setCategories(data.categories || []);
      if (data.categories && data.categories.length > 0 && !itemForm.category_id) {
        setItemForm((prev) => ({ ...prev, category_id: data.categories[0].id }));
      }
    } catch (err) {
      if (!handleAuthError(err)) {
        console.error(err);
      }
    }
  };

  const loadTables = async () => {
    try {
      const data = await managerApi.getTables();
      setTables(data.tables || []);
    } catch (err) {
      if (!handleAuthError(err)) {
        console.error(err);
      }
    }
  };

  const loadSalesAndOrders = async () => {
    try {
      const [sRes, oRes] = await Promise.all([
        managerApi.getSales(),
        managerApi.getOrders()
      ]);
      setSalesData(sRes);
      setOrders(oRes.orders || []);
    } catch (err) {
      if (!handleAuthError(err)) {
        console.error(err);
      }
    }
  };

  const loadStaff = async () => {
    try {
      const data = await managerApi.getStaff();
      setStaffList(data.staff || []);
    } catch (err) {
      if (!handleAuthError(err)) {
        console.error(err);
      }
    }
  };

  const loadLoyalty = async () => {
    try {
      const [cRes, lRes] = await Promise.all([
        managerApi.getCustomers(),
        managerApi.getLoyaltyLedger()
      ]);
      setCustomers(cRes.customers || []);
      setLoyaltyLedger(lRes.ledger || []);
    } catch (err) {
      if (!handleAuthError(err)) {
        console.error(err);
      }
    }
  };

  useEffect(() => {
    loadMenu();
    loadTables();
    loadSalesAndOrders();
    loadStaff();
    loadLoyalty();
  }, []);

  // Handlers
  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    try {
      await managerApi.createCategory(newCatName.trim());
      setNewCatName('');
      setIsAddCatModalOpen(false);
      loadMenu();
    } catch (err: any) {
      if (!handleAuthError(err)) {
        alert(err.message || 'Failed to create category.');
      }
    }
  };

  const handleCreateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const pricePaise = Math.round(parseFloat(itemForm.base_price_rupees) * 100);
      const variants: any[] = [];
      if (itemForm.variant_name && itemForm.variant_price) {
        variants.push({
          name: itemForm.variant_name,
          price_paise: Math.round(parseFloat(itemForm.variant_price) * 100)
        });
      }

      await managerApi.createItem({
        name: itemForm.name,
        category_id: itemForm.category_id,
        description: itemForm.description,
        base_price_paise: pricePaise,
        image_url: itemForm.image_url || undefined,
        dietary_type: itemForm.dietary_type,
        preparation_time_minutes: parseInt(itemForm.preparation_time_minutes, 10) || 15,
        variants
      });

      setIsAddItemModalOpen(false);
      setItemForm({
        name: '',
        category_id: categories[0]?.id || '',
        description: '',
        base_price_rupees: '',
        image_url: '',
        dietary_type: 'veg',
        preparation_time_minutes: '15',
        variant_name: '',
        variant_price: ''
      });
      loadMenu();
    } catch (err: any) {
      if (!handleAuthError(err)) {
        alert(err.message || 'Failed to create item.');
      }
    }
  };

  const handleToggleAvailability = async (id: string, current: boolean) => {
    try {
      await managerApi.toggleItemAvailability(id, !current);
      loadMenu();
    } catch (err: any) {
      if (!handleAuthError(err)) {
        alert(err.message || 'Failed to toggle item.');
      }
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this menu item?')) return;
    try {
      await managerApi.deleteItem(id);
      loadMenu();
    } catch (err: any) {
      if (!handleAuthError(err)) {
        alert(err.message || 'Failed to delete item.');
      }
    }
  };

  const handleCreateTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTableNum) return;
    try {
      await managerApi.createTable(newTableNum, parseInt(newTableCap, 10));
      setNewTableNum('');
      loadTables();
    } catch (err: any) {
      if (!handleAuthError(err)) {
        alert(err.message || 'Failed to create table.');
      }
    }
  };

  const handleViewQr = async (tableId: string) => {
    try {
      const data = await managerApi.generateQr(tableId);
      setActiveQrModal(data);
    } catch (err: any) {
      if (!handleAuthError(err)) {
        alert(err.message || 'Failed to generate QR.');
      }
    }
  };

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await managerApi.createStaff(staffForm);
      setIsAddStaffModalOpen(false);
      setStaffForm({ full_name: '', email: '', password: '', role: 'waiter' });
      loadStaff();
    } catch (err: any) {
      if (!handleAuthError(err)) {
        alert(err.message || 'Failed to create staff member.');
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col md:flex-row font-sans transition-colors">
      {/* Sidebar Navigation */}
      <aside className="w-full md:w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 p-5 flex flex-col justify-between shrink-0">
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            {restaurant?.logo_url ? (
              <img src={restaurant.logo_url} alt="" className="w-10 h-10 rounded-xl object-cover border border-slate-200 dark:border-slate-800" />
            ) : (
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white text-base"
                style={{ backgroundColor: restaurant?.primary_color || '#e11d48' }}
              >
                {restaurant?.name?.charAt(0) || 'M'}
              </div>
            )}
            <div>
              <h1 className="font-bold text-sm text-slate-900 dark:text-white">{restaurant?.name}</h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Manager Console</p>
            </div>
          </div>

          <nav className="space-y-1 text-xs font-semibold">
            <button
              onClick={() => setActiveTab('overview')}
              className={`w-full p-3 rounded-xl flex items-center gap-3 transition-colors ${
                activeTab === 'overview' ? 'bg-rose-600 text-white' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              Overview &amp; Analytics
            </button>
            <button
              onClick={() => setActiveTab('menu')}
              className={`w-full p-3 rounded-xl flex items-center gap-3 transition-colors ${
                activeTab === 'menu' ? 'bg-rose-600 text-white' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
              }`}
            >
              <UtensilsCrossed className="w-4 h-4" />
              Menu &amp; Recipes
            </button>
            <button
              onClick={() => setActiveTab('tables')}
              className={`w-full p-3 rounded-xl flex items-center gap-3 transition-colors ${
                activeTab === 'tables' ? 'bg-rose-600 text-white' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
              }`}
            >
              <QrCode className="w-4 h-4" />
              Dining Tables &amp; QR
            </button>
            <button
              onClick={() => setActiveTab('sales')}
              className={`w-full p-3 rounded-xl flex items-center gap-3 transition-colors ${
                activeTab === 'sales' ? 'bg-rose-600 text-white' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
              }`}
            >
              <DollarSign className="w-4 h-4" />
              Verified Sales Reports
            </button>
            <button
              onClick={() => setActiveTab('staff')}
              className={`w-full p-3 rounded-xl flex items-center gap-3 transition-colors ${
                activeTab === 'staff' ? 'bg-rose-600 text-white' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
              }`}
            >
              <Users className="w-4 h-4" />
              Staff Accounts
            </button>
            <button
              onClick={() => setActiveTab('loyalty')}
              className={`w-full p-3 rounded-xl flex items-center gap-3 transition-colors ${
                activeTab === 'loyalty' ? 'bg-rose-600 text-white' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
              }`}
            >
              <Award className="w-4 h-4" />
              Customers &amp; Loyalty
            </button>
          </nav>
        </div>

        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 dark:text-slate-400">Theme</span>
            <ThemeToggle />
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Manager: <span className="text-slate-900 dark:text-white font-semibold">{user?.fullName}</span>
          </div>
          <button
            onClick={logout}
            className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold flex items-center justify-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-6 md:p-8 overflow-y-auto bg-slate-50 dark:bg-slate-950">
        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Operations &amp; Sales Overview</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
                <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Paid Gross Revenue</div>
                <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-2">
                  ₹{((salesData?.summary?.total_gross_sales_paise || 0) / 100).toFixed(2)}
                </div>
                <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">From verified paid bills</div>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
                <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">GST Tax Collected</div>
                <div className="text-2xl font-black text-slate-900 dark:text-white mt-2">
                  ₹{((salesData?.summary?.total_tax_collected_paise || 0) / 100).toFixed(2)}
                </div>
                <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">Audit ready records</div>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
                <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Bills Settled</div>
                <div className="text-2xl font-black text-slate-900 dark:text-white mt-2">
                  {salesData?.summary?.total_bills_paid || 0}
                </div>
                <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">Transactions completed</div>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
                <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Active Tables</div>
                <div className="text-2xl font-black text-slate-900 dark:text-white mt-2">
                  {tables.filter((t) => t.status === 'occupied').length} / {tables.length}
                </div>
                <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">Currently dining guests</div>
              </div>
            </div>

            {/* Recent Orders Table */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6">
              <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4">Recent Restaurant Orders</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-950/80 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Order #</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4">Customer Phone</th>
                      <th className="py-3 px-4">Subtotal</th>
                      <th className="py-3 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {orders.slice(0, 10).map((o) => (
                      <tr key={o.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">{o.order_number}</td>
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-300">{o.order_type === 'dine_in' ? `Table ${o.table_number}` : 'Takeaway'}</td>
                        <td className="py-3 px-4 font-mono text-slate-500 dark:text-slate-400">{o.customer_phone_snapshot}</td>
                        <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">₹{(o.subtotal_paise / 100).toFixed(0)}</td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                            {o.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: MENU MANAGEMENT */}
        {activeTab === 'menu' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Menu &amp; Recipe Builder</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">Add dishes with description, image, prep time, variants &amp; modifiers</p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsAddCatModalOpen(true)}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors"
                >
                  + Add Category
                </button>
                <button
                  onClick={() => setIsAddItemModalOpen(true)}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-lg shadow-rose-900/30 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add Menu Item
                </button>
              </div>
            </div>

            {/* Categories & Items List */}
            <div className="space-y-6">
              {categories.map((cat) => (
                <div key={cat.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 space-y-4 shadow-sm">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">{cat.name}</h3>
                    <span className="text-xs text-slate-500">{cat.items?.length || 0} dishes</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {cat.items?.map((item: any) => (
                      <div key={item.id} className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-4 flex gap-3 justify-between">
                        <div className="space-y-1 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full ${item.dietary_type === 'veg' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                            <span className="font-bold text-xs text-slate-900 dark:text-white">{item.name}</span>
                          </div>
                          {item.description && (
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1">{item.description}</p>
                          )}
                          <div className="text-xs font-black text-rose-600 dark:text-rose-400">
                            ₹{(item.base_price_paise / 100).toFixed(0)}
                          </div>
                          <div className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {item.preparation_time_minutes} mins prep
                          </div>
                        </div>

                        {item.image_url && (
                          <img src={item.image_url} alt="" className="w-16 h-16 rounded-xl object-cover shrink-0 border border-slate-200 dark:border-slate-800" />
                        )}

                        <div className="flex flex-col justify-between items-end">
                          <button
                            onClick={() => handleToggleAvailability(item.id, item.is_available)}
                            className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase transition-all ${
                              item.is_available ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                            }`}
                          >
                            {item.is_available ? 'Available' : 'Sold Out'}
                          </button>
                          <button
                            onClick={() => handleDeleteItem(item.id)}
                            className="text-slate-400 hover:text-rose-500 dark:text-slate-500 dark:hover:text-rose-400 text-xs p-1 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: TABLES & QR MANAGEMENT */}
        {activeTab === 'tables' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Dining Tables &amp; QR Codes</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">Generate, test, and print high-resolution opaque QR tokens</p>
              </div>

              {/* Add Table Form */}
              <form onSubmit={handleCreateTable} className="flex items-center gap-2">
                <input
                  type="text"
                  required
                  placeholder="Table # (e.g. T-06)"
                  value={newTableNum}
                  onChange={(e) => setNewTableNum(e.target.value)}
                  className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-400"
                />
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={newTableCap}
                  onChange={(e) => setNewTableCap(e.target.value)}
                  className="w-16 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl px-2 py-2 text-xs text-slate-900 dark:text-white"
                />
                <button
                  type="submit"
                  className="bg-rose-600 hover:bg-rose-500 text-white font-bold px-4 py-2 rounded-xl text-xs transition-colors"
                >
                  Add Table
                </button>
              </form>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {tables.map((t) => (
                <div key={t.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 flex flex-col justify-between space-y-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-black text-slate-900 dark:text-white">Table {t.table_number}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">{t.capacity} Guests</span>
                  </div>

                  <div className="text-xs text-slate-500">
                    Status: <span className="text-slate-700 dark:text-slate-300 font-semibold">{t.status}</span>
                  </div>

                  <button
                    onClick={() => handleViewQr(t.id)}
                    className="w-full bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 border border-slate-200 dark:border-slate-800 transition-colors"
                  >
                    <QrCode className="w-4 h-4 text-rose-500" />
                    Generate &amp; Print QR
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 4: VERIFIED SALES */}
        {activeTab === 'sales' && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Verified Accounting &amp; Sales</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Payment Methods Breakdown */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 space-y-4 shadow-sm">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Settlement by Payment Method</h3>
                <div className="space-y-3">
                  {salesData?.payment_methods?.map((pm: any) => (
                    <div key={pm.method} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 text-xs">
                      <span className="font-bold text-slate-900 dark:text-white uppercase">{pm.method.replace('_', ' ')}</span>
                      <div className="text-right">
                        <div className="font-black text-emerald-600 dark:text-emerald-400">₹{(pm.total_amount_paise / 100).toFixed(2)}</div>
                        <div className="text-[10px] text-slate-500">{pm.payment_count} transactions</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top Selling Items */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 space-y-4 shadow-sm">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Top 10 Selling Dishes</h3>
                <div className="space-y-3">
                  {salesData?.top_items?.map((item: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 text-xs">
                      <span className="font-bold text-slate-900 dark:text-white">{item.item_name}</span>
                      <div className="text-right">
                        <div className="font-semibold text-slate-800 dark:text-white">{item.total_quantity_sold} sold</div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400">₹{(item.total_revenue_paise / 100).toFixed(0)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: STAFF MANAGEMENT */}
        {activeTab === 'staff' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Staff Account Management</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">Control staff roles, floor captains, and kitchen chefs</p>
              </div>

              <button
                onClick={() => setIsAddStaffModalOpen(true)}
                className="bg-rose-600 hover:bg-rose-500 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Staff Member
              </button>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-950/80 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-3.5 px-6">Staff Member</th>
                    <th className="py-3.5 px-6">Email</th>
                    <th className="py-3.5 px-6">Role</th>
                    <th className="py-3.5 px-6">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {staffList.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                      <td className="py-4 px-6 font-bold text-slate-900 dark:text-white">{s.full_name}</td>
                      <td className="py-4 px-6 font-mono text-slate-600 dark:text-slate-300">{s.email}</td>
                      <td className="py-4 px-6 font-semibold uppercase text-rose-600 dark:text-rose-400">{s.role}</td>
                      <td className="py-4 px-6">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          Active
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 6: CUSTOMERS & LOYALTY */}
        {activeTab === 'loyalty' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Customer Loyalty Ledger</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Rule: 1 point earned per ₹1 eligible spend on net item subtotal (Redemption disabled)
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Customers & Balances */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 space-y-4 shadow-sm">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Customer Directory</h3>
                <div className="space-y-3">
                  {customers.map((c) => (
                    <div key={c.id} className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-bold text-slate-900 dark:text-white">{c.name || 'Dine-In Guest'}</div>
                        <div className="font-mono text-slate-500 dark:text-slate-400">{c.phone_e164}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-black text-amber-500 dark:text-amber-400">{c.loyalty_balance} Points</div>
                        <div className="text-[10px] text-slate-500">{c.total_orders} orders</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Auditable Ledger Stream */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 space-y-4 shadow-sm">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Ledger Accrual Stream</h3>
                <div className="space-y-2 max-h-96 overflow-y-auto pr-1 text-xs">
                  {loyaltyLedger.map((l) => (
                    <div key={l.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800/80 flex items-center justify-between">
                      <div>
                        <span className="font-bold text-slate-900 dark:text-white">+{l.points_delta} Pts</span>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">{l.customer_name || l.phone_e164}</div>
                      </div>
                      <div className="text-right text-[10px] text-slate-500">
                        Spend: ₹{(l.eligible_spend_paise / 100).toFixed(0)}<br />
                        Balance: {l.balance_after}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* MODAL: ADD MENU ITEM */}
      {isAddItemModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 mb-4">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Add New Menu Item</h3>
              <button onClick={() => setIsAddItemModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white">✕</button>
            </div>

            <form onSubmit={handleCreateItem} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Item Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Tandoori Soya Chaap"
                  value={itemForm.name}
                  onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white placeholder:text-slate-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Category *</label>
                  <select
                    value={itemForm.category_id}
                    onChange={(e) => setItemForm({ ...itemForm, category_id: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Dietary Tag *</label>
                  <select
                    value={itemForm.dietary_type}
                    onChange={(e) => setItemForm({ ...itemForm, dietary_type: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white"
                  >
                    <option value="veg">Pure Veg</option>
                    <option value="non_veg">Non-Veg</option>
                    <option value="egg">Contains Egg</option>
                    <option value="vegan">Vegan</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Base Price (₹) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="250"
                    value={itemForm.base_price_rupees}
                    onChange={(e) => setItemForm({ ...itemForm, base_price_rupees: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white placeholder:text-slate-400"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Preparation Time (Mins) *</label>
                  <input
                    type="number"
                    min="1"
                    max="120"
                    required
                    value={itemForm.preparation_time_minutes}
                    onChange={(e) => setItemForm({ ...itemForm, preparation_time_minutes: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Description</label>
                <textarea
                  rows={2}
                  placeholder="Ingredients, flavors, special marinades..."
                  value={itemForm.description}
                  onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white placeholder:text-slate-400 resize-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Image URL</label>
                <input
                  type="url"
                  placeholder="https://images.unsplash.com/..."
                  value={itemForm.image_url}
                  onChange={(e) => setItemForm({ ...itemForm, image_url: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white placeholder:text-slate-400"
                />
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddItemModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold transition-colors"
                >
                  Save &amp; Publish
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD CATEGORY */}
      {isAddCatModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-sm w-full p-6 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4">Add Menu Category</h3>
            <form onSubmit={handleCreateCategory} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Category Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sizzlers & Grills"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white placeholder:text-slate-400"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddCatModalOpen(false)}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button type="submit" className="px-4 py-1.5 rounded-xl bg-rose-600 text-white font-bold hover:bg-rose-500 transition-colors">
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: VIEW & PRINT QR CODE */}
      {activeQrModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white text-slate-900 rounded-3xl max-w-xs w-full p-6 text-center shadow-2xl">
            <h3 className="text-lg font-black">{restaurant?.name}</h3>
            <p className="text-xs text-slate-500 mb-4">Official Dining Table QR</p>

            <img src={activeQrModal.qr_image} alt="QR Code" className="w-56 h-56 mx-auto mb-4 border border-slate-200 rounded-2xl" />

            <div className="text-[11px] text-slate-500 mb-4 break-all font-mono">
              {activeQrModal.qr_url}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => window.print()}
                className="flex-1 bg-slate-900 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 hover:bg-slate-800 transition-colors"
              >
                <Printer className="w-4 h-4" /> Print QR
              </button>
              <button
                onClick={() => setActiveQrModal(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-semibold text-xs hover:bg-slate-100 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD STAFF */}
      {isAddStaffModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-sm w-full p-6 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4">Add Staff Account</h3>
            <form onSubmit={handleCreateStaff} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Kumar"
                  value={staffForm.full_name}
                  onChange={(e) => setStaffForm({ ...staffForm, full_name: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white placeholder:text-slate-400"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Email *</label>
                <input
                  type="email"
                  required
                  placeholder="staff@royalspice.com"
                  value={staffForm.email}
                  onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white placeholder:text-slate-400"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Password *</label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={staffForm.password}
                  onChange={(e) => setStaffForm({ ...staffForm, password: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white placeholder:text-slate-400"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Role *</label>
                <select
                  value={staffForm.role}
                  onChange={(e) => setStaffForm({ ...staffForm, role: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white"
                >
                  <option value="waiter">Floor Waiter / Captain</option>
                  <option value="kitchen">Kitchen Chef (KDS)</option>
                  <option value="manager">Restaurant Manager</option>
                </select>
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddStaffModalOpen(false)}
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 rounded-xl bg-rose-600 text-white font-bold hover:bg-rose-500 transition-colors">
                  Create Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
