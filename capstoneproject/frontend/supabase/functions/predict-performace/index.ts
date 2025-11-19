import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import './index.css';
declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface PredictionRequest {
  studentId: string;
  examId: string;
  topicScores: { topicId: string; score: number; maxScore: number }[];
}

interface PredictionResponse {
  predictedGrade: number;
  confidence: number;
  weakestTopicId: string;
  recommendation: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { studentId, examId, topicScores }: PredictionRequest = await req.json();

    const scores = topicScores.map(ts => (ts.score / ts.maxScore) * 100);
    const averageScore = scores.reduce((a, b) => a + b, 0) / scores.length;

    const minScoreIndex = scores.indexOf(Math.min(...scores));
    const weakestTopicId = topicScores[minScoreIndex].topicId;

    const variance = scores.reduce((sum, score) => sum + Math.pow(score - averageScore, 2), 0) / scores.length;
    const stdDev = Math.sqrt(variance);
    
    const predictedGrade = averageScore + (Math.random() - 0.5) * 5;
    const confidence = Math.max(0.6, Math.min(0.95, 1 - (stdDev / 100)));

    const { data: topic } = await supabase
      .from('topics')
      .select('name, subject_id, subjects(name)')
      .eq('id', weakestTopicId)
      .single();

    const topicName = topic?.name || 'Unknown Topic';
    const subjectName = (topic as any)?.subjects?.name || 'this subject';

    const recommendations = [
      `Focus on improving ${topicName} through additional practice problems and review sessions.`,
      `Consider scheduling extra tutoring sessions for ${topicName} to strengthen your understanding.`,
      `Review the fundamental concepts in ${topicName} and work through example problems step by step.`,
      `Create a study schedule dedicated to mastering ${topicName} with daily practice.`,
      `Utilize online resources and video tutorials specifically covering ${topicName} in ${subjectName}.`,
    ];

    const recommendation = recommendations[Math.floor(Math.random() * recommendations.length)];

    const result: PredictionResponse = {
      predictedGrade: Math.round(predictedGrade * 10) / 10,
      confidence: Math.round(confidence * 100) / 100,
      weakestTopicId,
      recommendation,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});