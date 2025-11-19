// backend/prediction.js
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const API_KEY = process.env.GEMINI_API_KEY;

function generateFallbackReport(payload) {
  const { weakTopics = [], studentName = "Student", overallAverage = 0, topicPerformance = [] } = payload;

  let performanceDetails = "";
  if (topicPerformance && topicPerformance.length > 0) {
    performanceDetails = "\nTopic-wise Performance:\n";
    topicPerformance.forEach(topic => {
      performanceDetails += `• ${topic.name}: ${topic.percentage}%\n`;
    });
  }

  return `ACADEMIC PERFORMANCE REPORT FOR ${studentName.toUpperCase()}
${"=".repeat(60)}

1. PERFORMANCE SUMMARY
Overall Average Score: ${overallAverage}%
${performanceDetails}
Assessment: Your current performance indicates areas that need focused attention and improvement.

2. TOPICS REQUIRING ATTENTION
${weakTopics.map(t => `• ${t}`).join('\n')}

These topics show lower performance compared to your other subjects and are priority areas for improvement.

3. WHY THESE TOPICS MAY BE WEAK
• Conceptual gaps in foundational understanding
• Insufficient practice and repetition
• Missing prerequisite knowledge
• Lack of personalized learning approach

4. STEP-BY-STEP IMPROVEMENT PLAN

Daily Routine (45-60 minutes):
- Start with concept review (15 min)
- Solve practice problems (30 min)
- Analyze mistakes (15 min)

Weekly Goals:
- Complete 5 practice sets per weak topic
- Review previous week's learnings
- Practice previous year exam questions
- Seek teacher clarification on difficult concepts

Suggested Resources:
- Online tutorials and video lectures
- Practice question banks
- Study groups with peers
- One-on-one tutoring sessions

5. MOTIVATIONAL MESSAGE
Remember, every expert was once a beginner. Your dedication to improvement is the key to success. Consistent effort over time will definitely lead to better results. You've got this! Keep pushing forward! 💪

${"=".repeat(60)}
Report Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`;
}

export async function generateReport(payload) {
  try {
    // Validate and extract payload fields
    const { weakTopics = [], studentName = "Student", overallAverage = 0, topicPerformance = [] } = payload;
    
    // 🆕 Get current date in proper format
    const currentDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    
    // Log the received payload for debugging
    console.log("📊 Received payload:", {
      studentName,
      overallAverage,
      weakTopicsCount: weakTopics?.length || 0,
      topicPerformanceCount: topicPerformance?.length || 0
    });

    const prompt = `
Generate a structured academic improvement report.
Student Name: ${studentName || "Student"}
Overall Average: ${overallAverage || 0}%
Weak Topics: ${weakTopics?.length > 0 ? weakTopics.join(", ") : "Not specified"}
Report Date: ${currentDate}

Topic Performance Summary:
${topicPerformance && topicPerformance.length > 0 ? JSON.stringify(topicPerformance, null, 2) : 'Not provided'}

Write the report with these exact sections:
1. PERFORMANCE SUMMARY - Include overall average and topic-wise breakdown
2. TOPICS REQUIRING ATTENTION - List the weak topics
3. WHY THESE TOPICS MAY BE WEAK - Provide 3-4 reasons
4. STEP-BY-STEP IMPROVEMENT PLAN - Include daily and weekly schedule
5. MOTIVATIONAL MESSAGE - Encouraging closing

IMPORTANT: End the report with exactly this line:
Report Generated: ${currentDate}

Make it professional, actionable, and specific to the student's data provided above.
    `;

    try {
      // Initialize Google Generative AI with API key
      const genAI = new GoogleGenerativeAI(API_KEY);
      
      // Try multiple available models in order of preference
      const models = ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash", "gemini-pro"];
      let reportText = null;
      
      for (const modelName of models) {
        try {
          console.log(`📤 Trying model: ${modelName}...`);
          const model = genAI.getGenerativeModel({ model: modelName });
          
          const result = await model.generateContent(prompt);
          const response = result.response;
          reportText = response.text();
          
          if (reportText) {
            console.log(`✅ Successfully generated report using ${modelName}!`);
            return reportText;
          }
        } catch (modelError) {
          console.warn(`⚠️ Model ${modelName} failed:`, modelError.message.substring(0, 100));
          continue;
        }
      }
      
      console.log("⚠️ All Gemini models failed");
    } catch (apiError) {
      console.warn("⚠️ Gemini API error:", apiError.message.substring(0, 150));
    }

    // Fallback to generated report using payload data
    console.log("⚠️ Falling back to template-based report generation");
    return generateFallbackReport(payload);
  } catch (err) {
    console.error("❌ Prediction error:", err.message);
    // Return a basic fallback on error
    return generateFallbackReport(payload);
  }
}
