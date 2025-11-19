import { useEffect, useState, useCallback } from "react";
import { Layout } from "../components/Layout";
import { supabase } from "../lib/supabase";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts";
import { Upload, FileText, Users, TrendingUp, BookOpen } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export function TeacherDashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [exams, setExams] = useState<any[]>([]);
  const [totalStudents, setTotalStudents] = useState(0);
  const [averagePerformance, setAveragePerformance] = useState(0);
  const [classData, setClassData] = useState<{ exam: string; average: number }[]>([]);

  const loadDashboardData = useCallback(async () => {
    try {
      if (!user?.id) return;

      // ✅ Get teacher record mapped properly
      const { data: teacher } = await supabase
        .from("teachers")
        .select("teacher_id")
        .eq("teacher_id", user.id)
        .single();

      if (!teacher) {
        setLoading(false);
        return;
      }

      // ✅ Fetch exams created by this teacher
      const { data: examData } = await supabase
        .from("exams")
        .select("exam_id, exam_name, date_conducted, total_marks")
        .eq("teacher_id", teacher.teacher_id)
        .order("date_conducted", { ascending: false });

      setExams(examData || []);

      // ✅ Get exam_ids to filter scores by only THIS teacher’s exams
      const examIds = (examData || []).map((e) => e.exam_id);

      if (examIds.length === 0) {
        setTotalStudents(0);
        setAveragePerformance(0);
        setClassData([]);
        setLoading(false);
        return;
      }

      // ✅ Count unique students who took exams of this teacher
      const { data: studentScores } = await supabase
        .from("student_exam_scores")
        .select("student_id")
        .in("exam_id", examIds);

      const distinct = new Set(studentScores?.map((s) => s.student_id));
      setTotalStudents(distinct.size);

      // ✅ Compute average score only for this teacher's exams
      const { data: allScores } = await supabase
        .from("student_exam_scores")
        .select("score_obtained")
        .in("exam_id", examIds);

      if (allScores?.length > 0) {
        const avg = allScores.reduce((s, x) => s + x.score_obtained, 0) / allScores.length;
        setAveragePerformance(Math.round(avg));
      }

      // ✅ Build performance chart per exam
      const perfData: { exam: string; average: number }[] = [];

      for (const exam of examData || []) {
        const { data: scores } = await supabase
          .from("student_exam_scores")
          .select("score_obtained")
          .eq("exam_id", exam.exam_id);

        if (scores?.length > 0) {
          const avg = scores.reduce((s, x) => s + x.score_obtained, 0) / scores.length;
          perfData.push({ exam: exam.exam_name, average: Math.round(avg) });
        }
      }

      setClassData(perfData);
    } catch (error) {
      console.error("Error loading dashboard:", error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Teacher Dashboard</h1>
            <p className="text-gray-600 mt-1">Manage exams and track student performance</p>
          </div>

          <Link
            to="/upload"
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            <Upload className="w-5 h-5" />
            Upload Data
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <InfoCard icon={<FileText />} label="Total Exams" value={exams.length} color="blue" />
          <InfoCard icon={<Users />} label="Total Students" value={totalStudents} color="green" />
          <InfoCard icon={<TrendingUp />} label="Avg Performance" value={`${averagePerformance}%`} color="orange" />
          <InfoCard icon={<BookOpen />} label="Exams with Data" value={classData.length} color="purple" />
        </div>

        {classData.length > 0 && (
          <ChartCard title="Performance by Exam">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={classData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="exam" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="average" fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        <TableSection exams={exams} />

      </div>
    </Layout>
  );
}

function InfoCard({ icon, label, value, color }: any) {
  return (
    <div className="bg-white rounded-xl shadow-sm border p-6 flex gap-4 items-center">
      <div className={`w-12 h-12 bg-${color}-100 text-${color}-600 rounded-lg flex items-center justify-center`}>
        {icon}
      </div>
      <div>
        <p className="text-sm text-gray-600">{label}</p>
        <p className="text-2xl font-bold">{value}</p>
      </div>
    </div>
  );
}

function ChartCard({ title, children }: any) {
  return (
    <div className="bg-white rounded-xl shadow-sm border p-6">
      <h2 className="text-lg font-semibold mb-4">{title}</h2>
      {children}
    </div>
  );
}

function TableSection({ exams }: any) {
  return (
    <div className="bg-white rounded-xl shadow-sm border p-6">
      <h2 className="text-lg font-semibold mb-4">Recent Exams</h2>

      <table className="w-full">
        <thead>
          <tr className="border-b">
            <th className="py-3 text-left">Exam Name</th>
            <th className="py-3 text-left">Date</th>
            <th className="py-3 text-left">Total Marks</th>
          </tr>
        </thead>
        <tbody>
          {exams.map((exam: any) => (
            <tr key={exam.exam_id} className="border-b hover:bg-gray-50">
              <td className="py-3">{exam.exam_name}</td>
              <td className="py-3">{new Date(exam.date_conducted).toLocaleDateString()}</td>
              <td className="py-3">{exam.total_marks}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
