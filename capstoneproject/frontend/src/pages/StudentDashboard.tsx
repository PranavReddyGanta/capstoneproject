// src/pages/StudentDashboard.tsx
import { useEffect, useState, useCallback } from "react";
import { Layout } from "../components/Layout";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, Radar
} from "recharts";
import { TrendingDown, Target, BookOpen, Zap } from "lucide-react";

interface TopicPerformance {
  name: string;
  percentage: number;
}

export function StudentDashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [scores, setScores] = useState<any[]>([]);
  const [topicPerformance, setTopicPerformance] = useState<TopicPerformance[]>([]);
  const [predictions, setPredictions] = useState<any[]>([]);
  const [overallAverage, setOverallAverage] = useState<number>(0);

  const [aiReport, setAiReport] = useState<string>("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false); // 🆕 Track if report should be loaded

  // 🆕 Store calculated values for later use when generating report
  const [cachedData, setCachedData] = useState<{
    calculatedAverage: number;
    calculatedTopicPerformance: TopicPerformance[];
    predictionData: any;
  } | null>(null);

  const loadDashboardData = useCallback(async () => {
    try {
      if (!user?.id) return;

      // 1) Student record
      const { data: student } = await supabase
        .from("students")
        .select("*")
        .eq("student_id", user.id)
        .single();

      if (!student) {
        setLoading(false);
        return;
      }

      // 2) Exam scores
      const { data: scoreData } = await supabase
        .from("student_exam_scores")
        .select("score_obtained, topic_name")
        .eq("student_id", student.student_id);

      setScores(scoreData || []);

      // ✅ Calculate average and topic performance IMMEDIATELY
      let calculatedAverage = 0;
      let calculatedTopicPerformance: TopicPerformance[] = [];

      if (scoreData && scoreData.length > 0) {
        calculatedAverage = Math.round(
          scoreData.reduce((sum, s) => sum + (s.score_obtained || 0), 0) /
          scoreData.length
        );

        const topicMap = new Map<string, { total: number; count: number }>();

        scoreData.forEach((row) => {
          const current = topicMap.get(row.topic_name) || { total: 0, count: 0 };
          topicMap.set(row.topic_name, {
            total: current.total + (row.score_obtained || 0),
            count: current.count + 1
          });
        });

        calculatedTopicPerformance = Array.from(topicMap.entries()).map(([name, data]) => ({
          name,
          percentage: Math.round(data.total / data.count),
        }));
      }

      // ✅ Set state with calculated values
      setOverallAverage(calculatedAverage);
      setTopicPerformance(calculatedTopicPerformance);

      // 3) AI Prediction DB record
      const { data: predictionData } = await supabase
        .from("ai_predictions")
        .select("*")
        .eq("student_id", student.student_id)
        .order("created_at", { ascending: false })
        .limit(1);

      setPredictions(predictionData || []);

      // 🆕 Cache data for report generation later (when user clicks "See Report")
      setCachedData({
        calculatedAverage,
        calculatedTopicPerformance,
        predictionData: predictionData?.[0] || null
      });

    } catch (error) {
      console.error("Dashboard Load Error:", error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // 🆕 Function to generate report on demand when user clicks button
  const generateAiReport = useCallback(async () => {
    if (!cachedData?.predictionData) {
      setAiError("No prediction data available");
      return;
    }

    setAiLoading(true);
    setAiError(null);
    setShowReport(true);

    try {
      const payload = {
        weakTopics: cachedData.predictionData.topics_to_improve || [],
        studentName: user?.name || "Student",
        overallAverage: cachedData.calculatedAverage,
        topicPerformance: cachedData.calculatedTopicPerformance,
      };

      console.log("📤 Generating AI Report with:", payload);

      const r = await fetch("http://localhost:5000/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!r.ok) throw new Error(`Server error ${r.status}`);

      const json = await r.json();
      setAiReport(json.report || "");

    } catch (err: any) {
      setAiError(err.message || "AI report failed");
    } finally {
      setAiLoading(false);
    }
  }, [cachedData, user?.name]);

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin h-12 w-12 border-b-2 border-blue-600 rounded-full" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-gray-900">
          Welcome, {user?.full_name}
        </h1>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatCard icon={<Target />} label="Overall Average" value={`${overallAverage}%`} />
          <StatCard icon={<BookOpen />} label="Exams Taken" value={scores.length} />
          <StatCard
            icon={<TrendingDown />}
            label="Topics to Improve"
            value={predictions?.[0]?.topics_to_improve?.length || 0}
          />
        </div>

        {/* Charts */}
        {topicPerformance.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartCard title="Topic Wise Performance">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={topicPerformance}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="percentage" fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Performance Radar">
              <ResponsiveContainer width="100%" height={300}>
                <RadarChart data={topicPerformance}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="name" />
                  <PolarRadiusAxis />
                  <Radar dataKey="percentage" fill="#3b82f6" stroke="#3b82f6" fillOpacity={0.6} />
                </RadarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        )}

        {/* AI Report Section */}
        <ChartCard title="AI-Generated Study Report">
          {!showReport ? (
            <button
              onClick={generateAiReport}
              disabled={aiLoading}
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors font-medium"
            >
              <Zap size={20} />
              {aiLoading ? "Generating..." : "Generate AI Report"}
            </button>
          ) : aiLoading ? (
            <div className="flex items-center gap-2">
              <div className="animate-spin h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full" />
              <p className="text-gray-600">Generating report…</p>
            </div>
          ) : aiError ? (
            <p className="text-red-600">Error: {aiError}</p>
          ) : aiReport ? (
            <pre className="bg-blue-50 p-4 rounded whitespace-pre-wrap text-gray-800 text-sm border">
              {aiReport}
            </pre>
          ) : (
            <p className="text-gray-600">No AI report available.</p>
          )}
        </ChartCard>

        {scores.length === 0 && <EmptyMessage />}
      </div>
    </Layout>
  );
}

function StatCard({ icon, label, value }: any) {
  return (
    <div className="bg-white border rounded-xl p-6 shadow-sm flex gap-4 items-center">
      <div className="w-12 h-12 bg-blue-50 text-blue-700 rounded-lg flex items-center justify-center">
        {icon}
      </div>
      <div>
        <p className="text-gray-600 text-sm">{label}</p>
        <p className="text-2xl font-bold">{value}</p>
      </div>
    </div>
  );
}

function ChartCard({ title, children }: any) {
  return (
    <div className="bg-white border rounded-xl p-6 shadow-sm">
      <h2 className="text-lg font-semibold mb-3">{title}</h2>
      {children}
    </div>
  );
}

function EmptyMessage() {
  return (
    <div className="bg-white text-center border shadow-sm rounded-xl p-12">
      <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-3" />
      <h2 className="text-xl font-semibold">No exam results</h2>
      <p className="text-gray-600">Scores will appear when exams are uploaded.</p>
    </div>
  );
}

export default StudentDashboard;
