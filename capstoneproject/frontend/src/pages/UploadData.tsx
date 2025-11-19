import { useState } from 'react';
import { Layout } from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from "../lib/supabase";
import * as XLSX from "xlsx";
import { Upload, CheckCircle, AlertCircle, FileText } from 'lucide-react';

export function UploadData() {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [examName, setExamName] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setFile(e.target.files[0]);
      setError('');
      setSuccess(false);
    }
  };

  const handleUpload = async () => {
    if (!file) return setError("Please select a file.");
    if (!examName.trim()) return setError("Please enter exam name.");
    if (!user?.id) return setError("Authentication error.");

    setLoading(true);
    setError('');
    setSuccess(false);

    try {
      // ✅ Verify Teacher
      const { data: teacher } = await supabase
        .from("teachers")
        .select("teacher_id")
        .eq("teacher_id", user.id)
        .single();

      if (!teacher) throw new Error("Only teachers can upload data.");

      // ✅ Create Exam
      const { data: examData, error: examErr } = await supabase
        .from("exams")
        .insert([{ exam_name: examName, teacher_id: teacher.teacher_id }])
        .select()
        .single();

      if (examErr) throw examErr;
      const examId = examData.exam_id;

      // ✅ Read Excel → JSON
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet);

      // ✅ Get all student UUIDs once (no more per-row DB lookups)
      const { data: studentList } = await supabase
        .from("students")
        .select("student_id");

      const validStudentIDs = new Set(studentList?.map(s => s.student_id));

      const scoreRows: any[] = [];

      for (const row of rows as any[]) {
        // row.StudentID already contains UUID from your Excel ✔
        if (!validStudentIDs.has(row.StudentID)) {
          console.warn(`⚠️ No matching student for UUID: ${row.StudentID}`);
          continue;
        }

        scoreRows.push({
          exam_id: examId,
          student_id: row.StudentID, // ✅ Direct match, no lookup needed
          topic_name: row.Topic,
          score_obtained: row.Score,
          attendance: row.Attendance,
          participation: row.Participation,
          homework_submission: row.HomeworkSubmission,
          extracurricular_load: row.ExtracurricularLoad
        });
      }

      // ✅ Insert all scores in one call (fast)
      const { error: scoreErr } = await supabase
        .from("student_exam_scores")
        .insert(scoreRows);

      if (scoreErr) throw scoreErr;

      // ✅ CALL ML API
      const mlFormData = new FormData();
      mlFormData.append("file", file);

      const mlResponse = await fetch("http://localhost:8001/predict-json", {
        method: "POST",
        body: mlFormData,
      });

      if (!mlResponse.ok) throw new Error("ML model processing failed");
      const mlPredictions = await mlResponse.json();

      // ✅ Insert predictions
      const formattedPredictions = mlPredictions.map((p: any) => ({
        student_id: p.student_id,
        exam_id: examId,
        predicted_score: p.predicted_strength,
        topics_to_improve: p.topics_to_improve, // TEXT[]
        confidence_score: p.confidence || null
      }));

      const { error: predErr } = await supabase
        .from("ai_predictions")
        .insert(formattedPredictions);

      if (predErr) throw predErr;

      setSuccess(true);
    } catch (err: any) {
      setError(err.message || "Upload failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-6">

        <h1 className="text-3xl font-bold text-gray-900">Upload Exam Results</h1>
        <p className="text-gray-600 -mt-2">Store marks & generate AI insights automatically</p>

        <div className="bg-white rounded-xl shadow-sm border p-8 space-y-6">

          {success && <SuccessAlert message="Upload & AI prediction successful!" />}
          {error && <ErrorAlert message={error} />}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Exam Name</label>
            <input
              type="text"
              value={examName}
              onChange={(e) => setExamName(e.target.value)}
              className="w-full border px-4 py-3 rounded-lg"
              placeholder="Example: Midterm Test"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Select Excel File</label>
            <label className="flex items-center justify-center px-6 py-8 border-2 border-dashed rounded-lg cursor-pointer">
              <div className="text-center">
                <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                <p className="text-sm text-gray-600">{file ? file.name : "Click to choose .xlsx file"}</p>
              </div>
              <input type="file" accept=".xlsx,.xls" onChange={handleFileChange} className="hidden" />
            </label>
          </div>

          <button
            onClick={handleUpload}
            disabled={loading || !file}
            className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Processing..." : "Upload & Generate AI Predictions"}
          </button>
        </div>

        <FormatHint />
      </div>
    </Layout>
  );
}

function SuccessAlert({ message }: { message: string }) {
  return (
    <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex gap-3">
      <CheckCircle className="w-5 h-5 text-green-600" />
      <p className="text-green-700">{message}</p>
    </div>
  );
}

function ErrorAlert({ message }: { message: string }) {
  return (
    <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex gap-3">
      <AlertCircle className="w-5 h-5 text-red-600" />
      <p className="text-red-800">{message}</p>
    </div>
  );
}

function FormatHint() {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
      <FileText className="w-5 h-5 text-blue-600 mb-2" />
      <h3 className="font-medium text-blue-900">Required Excel Columns:</h3>
      <ul className="text-sm text-blue-800 mt-2 space-y-1">
        <li>• StudentID ( = UUID from your dataset ) ✅</li>
        <li>• Topic</li>
        <li>• Score</li>
        <li>• Attendance</li>
        <li>• Participation</li>
        <li>• HomeworkSubmission</li>
        <li>• ExtracurricularLoad</li>
      </ul>
    </div>
  );
}
