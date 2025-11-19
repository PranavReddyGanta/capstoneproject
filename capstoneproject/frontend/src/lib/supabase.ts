import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/* ======================
   USER MODEL (matches DB)
   ====================== */

export interface User {
  id: string;              // mapped → user_id
  email: string;
  name: string;            // mapped → full_name
  role: 'student' | 'teacher' | 'admin';
  created_at: string;
}

/* ======================
   STUDENT MODEL
   ====================== */

export interface Student {
  student_id: string;      // primary key = users.user_id
  department: string | null;
  year: number | null;
  section: string | null;
  roll_number: string | null;
}

/* ======================
   TEACHER MODEL
   ====================== */

export interface Teacher {
  teacher_id: string;  
  department: string | null;
  designation: string | null;
}

/* ======================
   EXAM MODEL
   ====================== */

export interface Exam {
  exam_id: string;
  teacher_id: string | null;
  exam_name: string;
  subject_name: string | null;
  total_marks: number | null;
  date_conducted: string;
}

/* ======================
   STUDENT EXAM SCORES
   ====================== */

export interface StudentExamScore {
  record_id: string;
  exam_id: string;
  student_id: string;
  topic_name: string | null;
  score_obtained: number | null;

  attendance: number | null;
  participation: number | null;
  homework_submission: number | null;
  extracurricular_load: number | null;
}

/* ======================
   AI PREDICTIONS
   ====================== */

export interface AIPrediction {
  prediction_id: string;
  student_id: string;
  exam_id: string | null;
  predicted_score: number | null;
  topics_to_improve: string[] | null;
  confidence_score: number | null;
  created_at: string;
}

/* ======================
   ML MODEL INFO
   ====================== */

export interface MLModelInfo {
  version: string;
  accuracy: number | null;
  loss: number | null;
  epochs: number | null;
  dataset_size: number | null;
  status: 'Active' | 'Old' | 'Testing';
}
