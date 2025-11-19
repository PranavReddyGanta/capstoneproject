from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
import pandas as pd
import numpy as np
import joblib
import tensorflow as tf
import json, io

app = FastAPI(title="Topic-Wise Student Profiling API (LONG)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # tighten in prod
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---- register same Lambda used in training BEFORE loading model ----
@tf.keras.utils.register_keras_serializable()
def soft_attention_over_time(x):
    scores = tf.reduce_sum(x, axis=-1)
    weights = tf.nn.softmax(scores, axis=1)
    weights = tf.expand_dims(weights, -1)
    return tf.reduce_sum(x * weights, axis=1)

# ---------------- Artifacts ---------------- #
MODEL_PATH = "topic_profiler_2branch.h5"
SEQ_SCALER_PATH = "seq_scaler.pkl"
NONACAD_SCALER_PATH = "nonacad_scaler.pkl"
LE_PATH = "label_encoder.pkl"
META_PATH = "subjects_meta.json"

REQUIRED_LONG = {
    "StudentID","Name","Topic","Score",
    "Attendance","Participation","HomeworkSubmission","ExtracurricularLoad"
}

try:
    model = tf.keras.models.load_model(MODEL_PATH, compile=False)
    model.compile(optimizer="adam", loss="sparse_categorical_crossentropy", metrics=["accuracy"])
    seq_scaler = joblib.load(SEQ_SCALER_PATH)
    nonacad_scaler = joblib.load(NONACAD_SCALER_PATH)
    le = joblib.load(LE_PATH)
    with open(META_PATH, "r") as f:
        meta = json.load(f)
    SUBJECT_COLS = meta["subject_cols"]            # topics seen at training
    NONACAD_COLS = meta["nonacademic_cols"]        # fixed names
    load_error = None
except Exception as e:
    model = None
    load_error = str(e)

@app.get("/health")
def health():
    if load_error:
        return JSONResponse({"status": "error", "detail": load_error}, status_code=500)
    return {"status": "ok"}

def ensure_long_columns(df: pd.DataFrame):
    missing = [c for c in REQUIRED_LONG if c not in df.columns]
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing required columns: {sorted(missing)}")

def preprocess_long(df: pd.DataFrame):
    """
    Accepts LONG dataframe.
    Pivots to wide (topics), aligns to SUBJECT_COLS learned at training,
    scales and shapes inputs.
    """
    ensure_long_columns(df)

    # pivot to topic matrix
    pivot = (df.pivot_table(index=["StudentID","Name"],
                            columns="Topic",
                            values="Score", aggfunc="mean")
             .reindex(columns=SUBJECT_COLS)      # align to training topics
             .fillna(0.0))

    # non-acad per student (first value)
    nonacad = (df.sort_values(["StudentID","Name"])
                 .groupby(["StudentID","Name"], as_index=True)[NONACAD_COLS]
                 .first()
                 .loc[pivot.index])

    # scale/shape
    seq_scaled = seq_scaler.transform(pivot.values).reshape(pivot.shape[0], pivot.shape[1], 1)
    non_scaled = nonacad_scaler.transform(nonacad.values)

    return pivot.index, seq_scaled, non_scaled, pivot.values, nonacad.values  # indexes, tensors, raw

def build_reasons(weak_topics_list, raw_nonacad_row):
    tips = [f"Focus on: {weak_topics_list}."]
    att, part, hw, extra = raw_nonacad_row
    if att < 75: tips.append("Improve attendance (≥75%).")
    if hw < 70: tips.append("Increase homework completion (≥70%).")
    if part < 5: tips.append("Participate more in class (≥5/10).")
    if extra > 6: tips.append("Reduce extracurricular load near exams.")
    return " ".join(tips)

# -------- Return XLSX (for download) --------
@app.post("/predict-file")
async def predict_file(file: UploadFile = File(...)):
    if load_error:
        raise HTTPException(status_code=500, detail=f"Model load error: {load_error}")

    try:
        content = await file.read()
        df = pd.read_excel(io.BytesIO(content))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid Excel file format.")

    idx, X_seq, X_non, raw_topics, raw_nonacad = preprocess_long(df)

    y_prob = model.predict([X_seq, X_non], verbose=0)
    y_pred = np.argmax(y_prob, axis=1)
    mastery = le.inverse_transform(y_pred)

    # top-2 weak topics per student
    weak_topics = []
    for row in raw_topics:
        ids = np.argsort(row)[:2]
        weak_topics.append(", ".join([SUBJECT_COLS[i] for i in ids]))

    # recommendations
    recs = [build_reasons(weak_topics[i], raw_nonacad[i]) for i in range(len(mastery))]

    out = pd.DataFrame({
        "StudentID": [i[0] for i in idx],
        "Name": [i[1] for i in idx],
        "PredictedMastery": mastery,
        "WeakTopics": weak_topics,
        "Recommendation": recs
    })

    buffer = io.BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        out.to_excel(writer, index=False, sheet_name="Predictions")
    buffer.seek(0)

    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="topic_predictions_report.xlsx"'}
    )

@app.post("/predict-json")
async def predict_json(file: UploadFile = File(...)):
    if load_error:
        raise HTTPException(status_code=500, detail=f"Model load error: {load_error}")

    try:
        content = await file.read()
        df = pd.read_excel(io.BytesIO(content))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid Excel file format.")

    idx, X_seq, X_non, raw_topics, raw_nonacad = preprocess_long(df)

    # Predict mastery labels ("Low", "Medium", "High")
    y_prob = model.predict([X_seq, X_non], verbose=0)
    y_pred = np.argmax(y_prob, axis=1)
    mastery = le.inverse_transform(y_pred)
    confidences = np.max(y_prob, axis=1)

    # Get bottom-2 weak topics per student → array
    topics_to_improve = []
    for row in raw_topics:
        ids = np.argsort(row)[:2]
        topics_to_improve.append([SUBJECT_COLS[i] for i in ids])

    # Convert mastery to numeric scale for storage
    mastery_scale = {"Low": 1, "Medium": 2, "High": 3}

    payload = []
    for k in range(len(mastery)):
        student_uuid = str(idx[k][0])   # ✅ DO NOT CAST to int
        label = mastery[k]

        payload.append({
            "student_id": student_uuid,                       # UUID ✔
            "predicted_strength": mastery_scale[label],       # integer 1–3 ✔
            "topics_to_improve": topics_to_improve[k],        # string[] ✔
            "confidence": float(confidences[k])               # float
        })

    return JSONResponse(content=payload)  # ✅ return an array, not wrapped!


@app.get("/model-stats")
def model_stats():
    try:
        with open("model_info.json","r") as f:
            return json.load(f)
    except Exception:
        raise HTTPException(status_code=500, detail="Run training first (model_info.json not found).")

@app.get("/training-curves")
def training_curves():
    try:
        with open("training_metrics.json","r") as f:
            return json.load(f)
    except Exception:
        raise HTTPException(status_code=500, detail="Run training first (training_metrics.json not found).")
