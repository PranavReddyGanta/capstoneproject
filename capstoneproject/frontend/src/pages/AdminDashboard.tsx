import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { supabase } from '../lib/supabase';
import { Users, GraduationCap, BookOpen, Activity, Trash2 } from 'lucide-react';
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend
} from "chart.js";
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

export function AdminDashboard({ defaultView = "users" }: any) {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<any[]>([]);
  const [modelInfo, setModelInfo] = useState<any[]>([]);
  const [trainingData, setTrainingData] = useState<any>(null);
  const [view, setView] = useState<"users" | "students" | "teachers" | "admins" | "ml">(defaultView);

  const [stats, setStats] = useState({
    totalUsers: 0,
    students: 0,
    teachers: 0,
    admins: 0,
  });

  const [page, setPage] = useState(1);
  const perPage = 10;

  useEffect(() => {
    loadStats();
    loadUsers();
    loadMLData();
  }, [view, page]);

  const loadStats = async () => {
    const { data: userData } = await supabase.from('users').select('role');
    if (userData) {
      setStats({
        totalUsers: userData.length,
        students: userData.filter(u => u.role === 'student').length,
        teachers: userData.filter(u => u.role === 'teacher').length,
        admins: userData.filter(u => u.role === 'admin').length,
      });
    }
  };

  const loadUsers = async () => {
    setLoading(true);
    try {
      let query = supabase.from('users')
        .select('user_id, full_name, email, role, created_at', { count: 'exact' })
        .order('created_at', { ascending: false });

      if (view === "students") query = query.eq('role', 'student');
      else if (view === "teachers") query = query.eq('role', 'teacher');
      else if (view === "admins") query = query.eq('role', 'admin');

      const start = (page - 1) * perPage;
      const end = start + perPage - 1;

      const { data, count } = await query.range(start, end);
      setUsers(data || []);
      setStats(prev => ({ ...prev, totalUsers: count || prev.totalUsers }));
    } finally {
      setLoading(false);
    }
  };

  const loadMLData = async () => {
    if (view !== "ml") return;
    try {
      const { data: modelData } = await supabase.from('ml_model_info').select('*');
      setModelInfo(modelData || []);

      const response = await fetch("http://localhost:8001/training-curves");
      const json = await response.json();
      setTrainingData({
        epochs: json.epochs || [],
        train_accuracy: json.train_accuracy || [],
        val_accuracy: json.val_accuracy || [],
        train_loss: json.train_loss || [],
        val_loss: json.val_loss || []
      });
    } catch (err) {
      console.error("Failed to load ML model data:", err);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user?')) return;
    await supabase.from('users').delete().eq('user_id', userId);
    loadUsers();
  };

  const totalPages = Math.ceil(stats.totalUsers / perPage);

  if (loading) {
    return (
      <Layout setView={setView}>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout setView={setView}>
      <div className="space-y-8">
        <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>

        {/* Stat Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <StatCard icon={<Users />} label="Total Users" value={stats.totalUsers} color="blue" onClick={() => { setView("users"); setPage(1); }} />
          <StatCard icon={<GraduationCap />} label="Students" value={stats.students} color="green" onClick={() => { setView("students"); setPage(1); }} />
          <StatCard icon={<BookOpen />} label="Teachers" value={stats.teachers} color="indigo" onClick={() => { setView("teachers"); setPage(1); }} />
          <StatCard icon={<Activity />} label="Admins" value={stats.admins} color="orange" onClick={() => { setView("admins"); setPage(1); }} />
        </div>

        {/* Conditional Rendering */}
        {view === "ml" ? (
          <>
            <ModelTable modelInfo={modelInfo} />
            {trainingData && <TrainingCharts trainingData={trainingData} />}
          </>
        ) : (
          <UserTable
            users={users}
            handleDeleteUser={handleDeleteUser}
            view={view}
            page={page}
            setPage={setPage}
            totalPages={totalPages}
          />
        )}
      </div>
    </Layout>
  );
}

/* --- UI Components --- */

function StatCard({ icon, label, value, color, onClick }: any) {
  return (
    <div
      onClick={onClick}
      className={`cursor-pointer bg-gradient-to-br from-${color}-50 to-white border-l-4 border-${color}-500 rounded-xl shadow p-6 flex gap-4 items-center hover:shadow-md transition`}
    >
      <div className={`w-12 h-12 flex items-center justify-center bg-${color}-100 text-${color}-600 rounded-lg text-2xl`}>
        {icon}
      </div>
      <div>
        <p className="text-gray-600 text-sm">{label}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  );
}

function UserTable({ users, handleDeleteUser, view, page, setPage, totalPages }: any) {
  return (
    <div className="bg-white rounded-xl shadow p-6">
      <h2 className="text-lg font-semibold mb-4 text-gray-900 capitalize">
        {view === "users" ? "All Users" : view}
      </h2>

      <table className="w-full border-collapse text-center">
        <thead className="bg-gray-100 text-gray-700">
          <tr>
            <th className="p-3 border">Name</th>
            <th className="p-3 border">Email</th>
            <th className="p-3 border">Role</th>
            <th className="p-3 border">Created</th>
            <th className="p-3 border">Action</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u: any) => (
            <tr key={u.user_id} className="border-b hover:bg-gray-50 transition">
              <td className="p-3 border">{u.full_name}</td>
              <td className="p-3 border">{u.email}</td>
              <td className="p-3 border capitalize font-medium text-gray-800">{u.role}</td>
              <td className="p-3 border">{new Date(u.created_at).toLocaleDateString()}</td>
              <td className="p-3 border">
                <Trash2
                  onClick={() => handleDeleteUser(u.user_id)}
                  className="text-red-500 cursor-pointer hover:text-red-700 transition"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Pagination */}
      <div className="flex justify-center items-center mt-6 gap-3">
        <button
          onClick={() => setPage((p: number) => Math.max(1, p - 1))}
          disabled={page === 1}
          className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
        >
          Prev
        </button>
        <span className="text-gray-600 font-medium">
          Page {page} of {totalPages}
        </span>
        <button
          onClick={() => setPage((p: number) => Math.min(totalPages, p + 1))}
          disabled={page === totalPages}
          className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}

function ModelTable({ modelInfo }: any) {
  if (!modelInfo?.length) return null;

  return (
    <div className="bg-white rounded-xl shadow p-6">
      <h2 className="text-lg font-semibold mb-4 text-gray-900">ML Model Performance</h2>
      <table className="w-full text-center border-collapse">
        <thead className="bg-gray-100 text-gray-700">
          <tr>
            <th className="p-3 border">Version</th>
            <th className="p-3 border">Accuracy</th>
            <th className="p-3 border">Loss</th>
            <th className="p-3 border">Epochs</th>
            <th className="p-3 border">Dataset Size</th>
            <th className="p-3 border">Status</th>
          </tr>
        </thead>
        <tbody>
          {modelInfo.map((m: any) => (
            <tr key={m.version} className="border-t hover:bg-gray-50 transition">
              <td className="p-3 border">{m.version}</td>
              <td className="p-3 border text-green-600 font-semibold">{(m.accuracy * 100).toFixed(2)}%</td>
              <td className="p-3 border text-red-500">{m.loss}</td>
              <td className="p-3 border">{m.epochs}</td>
              <td className="p-3 border">{m.dataset_size}</td>
              <td className={`p-3 border ${m.status === 'Active' ? 'text-green-700 font-medium' : 'text-gray-600'}`}>{m.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TrainingCharts({ trainingData }: any) {
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: "top" as const },
    },
  };

  const accuracyData = {
    labels: trainingData.epochs,
    datasets: [
      {
        label: "Training Accuracy",
        data: trainingData.train_accuracy,
        borderColor: "#3b82f6",
        backgroundColor: "rgba(59,130,246,0.2)",
        tension: 0.4,
        fill: true,
      },
      {
        label: "Validation Accuracy",
        data: trainingData.val_accuracy,
        borderColor: "#10b981",
        backgroundColor: "rgba(16,185,129,0.2)",
        tension: 0.4,
        fill: true,
      },
    ],
  };

  const lossData = {
    labels: trainingData.epochs,
    datasets: [
      {
        label: "Training Loss",
        data: trainingData.train_loss,
        borderColor: "#f59e0b",
        backgroundColor: "rgba(245,158,11,0.2)",
        tension: 0.4,
        fill: true,
      },
      {
        label: "Validation Loss",
        data: trainingData.val_loss,
        borderColor: "#ef4444",
        backgroundColor: "rgba(239,68,68,0.2)",
        tension: 0.4,
        fill: true,
      },
    ],
  };

  return (
    <div className="bg-white rounded-xl shadow p-6">
      <h2 className="text-lg font-semibold text-center mb-6 text-gray-900">ML Training Curves</h2>
      <div className="grid grid-cols-1 gap-10">
        <div className="h-[350px]">
          <h3 className="text-center text-gray-700 font-medium mb-2">Accuracy Over Epochs</h3>
          <Line data={accuracyData} options={chartOptions} />
        </div>
        <div className="h-[350px]">
          <h3 className="text-center text-gray-700 font-medium mb-2">Loss Over Epochs</h3>
          <Line data={lossData} options={chartOptions} />
        </div>
      </div>
    </div>
  );
}
