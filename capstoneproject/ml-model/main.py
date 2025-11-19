# ===============================
# Train 2-Branch Topic Profiler (BiLSTM + Soft-Attention) + Non-Academic Dense
# DATA: Long format with columns:
#   StudentID, Name, Topic, Score, Attendance, Participation,
#   HomeworkSubmission, ExtracurricularLoad
# Label is derived from a weighted score -> ["Low","Medium","High"]
# Saves:
#   - topic_profiler_2branch.h5
#   - seq_scaler.pkl, nonacad_scaler.pkl, label_encoder.pkl
#   - subjects_meta.json, training_metrics.json, model_info.json
#   - topic_predictions_report.xlsx  (PredictedMastery + WeakTopics + Recommendation)
# ===============================

import json, os
import numpy as np
import pandas as pd
import tensorflow as tf
from tensorflow.keras import Model
from tensorflow.keras.layers import Dense, Dropout, LSTM, Bidirectional, Input, Concatenate, Lambda
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.model_selection import train_test_split
import joblib

# ---------------- Config ----------------
DATA_PATH = "topic_wise_dataset_long.xlsx"     # <= your LONG dataset
MODEL_PATH = "topic_profiler_2branch.h5"
SEQ_SCALER_PATH = "seq_scaler.pkl"
NONACAD_SCALER_PATH = "nonacad_scaler.pkl"
LE_PATH = "label_encoder.pkl"
META_PATH = "subjects_meta.json"
REPORT_PATH = "topic_predictions_report.xlsx"
TRAIN_CURVES_JSON = "training_metrics.json"
MODEL_INFO_JSON = "model_info.json"

REQUIRED_LONG = {
    "StudentID","Name","Topic","Score",
    "Attendance","Participation","HomeworkSubmission","ExtracurricularLoad"
}

# ---------------- Utils ----------------
def assert_columns(df: pd.DataFrame):
    missing = [c for c in REQUIRED_LONG if c not in df.columns]
    if missing:
        raise ValueError(f"Input file missing required columns: {sorted(missing)}")

@tf.keras.utils.register_keras_serializable()
def soft_attention_over_time(x):
    # x: (batch, timesteps, features)
    scores = tf.reduce_sum(x, axis=-1)          # (batch, timesteps)
    weights = tf.nn.softmax(scores, axis=1)     # (batch, timesteps)
    weights = tf.expand_dims(weights, -1)       # (batch, timesteps, 1)
    return tf.reduce_sum(x * weights, axis=1)   # (batch, features)

def build_labels_tertiles(df_long: pd.DataFrame) -> pd.Series:
    # derive a balanced label per student using tertiles of weighted score
    stu = (
        df_long.groupby(["StudentID","Name"])
        .agg(TopicAvg=("Score","mean"),
             Attendance=("Attendance","first"),
             Participation=("Participation","first"),
             HomeworkSubmission=("HomeworkSubmission","first"),
             ExtracurricularLoad=("ExtracurricularLoad","first"))
        .reset_index()
    )
    weighted = (
        0.7*stu["TopicAvg"]
        + 0.1*stu["HomeworkSubmission"]
        + 0.1*stu["Attendance"]
        + 0.1*stu["Participation"]
        - 0.05*stu["ExtracurricularLoad"]
    )
    q1, q2 = np.quantile(weighted, [1/3, 2/3])
    labels = np.where(weighted >= q2, "High",
                      np.where(weighted >= q1, "Medium", "Low"))
    lab_ser = pd.Series(labels, index=stu.set_index(["StudentID","Name"]).index)
    return lab_ser

# ---------------- Load & validate ----------------
df = pd.read_excel(DATA_PATH)
assert_columns(df)

# topic list learned from data (dynamic, no hardcode)
topic_list = sorted(df["Topic"].unique().tolist())
nonacad_cols = ["Attendance","Participation","HomeworkSubmission","ExtracurricularLoad"]

# ----- Pivot to per-student topic matrix -----
pivot = (df.pivot_table(index=["StudentID","Name"],
                        columns="Topic",
                        values="Score", aggfunc="mean")
           .reindex(columns=topic_list)
           .fillna(0.0))

# non-academic features per student (first occurrence)
nonacad = (df.sort_values(["StudentID","Name"])
             .groupby(["StudentID","Name"], as_index=True)[nonacad_cols]
             .first()
             .loc[pivot.index])

# labels (balanced tertiles)
y_labels = build_labels_tertiles(df).loc[pivot.index]

# ---------------- Encode & scale ----------------
le = LabelEncoder()
y = le.fit_transform(y_labels.values)

seq_scaler = StandardScaler()
seq_scaled = seq_scaler.fit_transform(pivot.values)                  # (n, T)
X_seq = seq_scaled.reshape(seq_scaled.shape[0], seq_scaled.shape[1], 1)

nonacad_scaler = StandardScaler()
X_non = nonacad_scaler.fit_transform(nonacad.values)                 # (n, F)

# ----- Split with stratify (safe now because of tertiles) -----
X_train_seq, X_test_seq, X_train_non, X_test_non, y_train, y_test = train_test_split(
    X_seq, X_non, y, test_size=0.2, random_state=42, stratify=y
)

# ---------------- Build Model (2 branches) ----------------
inp_seq = Input(shape=(X_train_seq.shape[1], 1), name="topic_seq")
x = Bidirectional(LSTM(128, return_sequences=True))(inp_seq)
x = Dropout(0.3)(x)
x = Bidirectional(LSTM(64, return_sequences=True))(x)
x = Dropout(0.3)(x)
attn_out = Lambda(soft_attention_over_time, name="soft_attention")(x)  # (batch, 128)

inp_non = Input(shape=(X_train_non.shape[1],), name="non_academic")
y_non = Dense(64, activation="relu")(inp_non)
y_non = Dropout(0.2)(y_non)

z = Concatenate()([attn_out, y_non])
z = Dense(64, activation="relu")(z)
z = Dropout(0.3)(z)
out = Dense(len(le.classes_), activation="softmax")(z)

model = Model(inputs=[inp_seq, inp_non], outputs=out)
model.compile(optimizer="adam", loss="sparse_categorical_crossentropy", metrics=["accuracy"])
model.summary()

# ---------------- Train ----------------
EPOCHS = 25
BATCH = 16
history = model.fit(
    [X_train_seq, X_train_non], y_train,
    validation_data=([X_test_seq, X_test_non], y_test),
    epochs=EPOCHS,
    batch_size=BATCH,
    verbose=1
)

# ---------------- Save artifacts ----------------
model.save(MODEL_PATH)
joblib.dump(seq_scaler, SEQ_SCALER_PATH)
joblib.dump(nonacad_scaler, NONACAD_SCALER_PATH)
joblib.dump(le, LE_PATH)

with open(META_PATH, "w") as f:
    json.dump({
        "subject_cols": topic_list,
        "nonacademic_cols": nonacad_cols
    }, f, indent=2)

# training curves
train_metrics = {
    "epochs": list(range(1, len(history.history["accuracy"]) + 1)),
    "train_accuracy": [float(v) for v in history.history["accuracy"]],
    "val_accuracy": [float(v) for v in history.history["val_accuracy"]],
    "train_loss": [float(v) for v in history.history["loss"]],
    "val_loss": [float(v) for v in history.history["val_loss"]],
}
with open(TRAIN_CURVES_JSON, "w") as f:
    json.dump(train_metrics, f, indent=2)

with open(MODEL_INFO_JSON, "w") as f:
    json.dump({
        "version": "v1",
        "accuracy": float(history.history["val_accuracy"][-1]),
        "loss": float(history.history["val_loss"][-1]),
        "epochs": EPOCHS,
        "dataset_size": int(len(y)),
        "is_active": True
    }, f, indent=2)

# ---------------- Build full predictions + reasons ----------------
y_prob_all = model.predict([X_seq, X_non], verbose=0)
y_pred_all = np.argmax(y_prob_all, axis=1)
pred_labels = le.inverse_transform(y_pred_all)

# weak topics: bottom-2 from original (unscaled) pivot
orig_scores = pivot.values
weak_topics = []
for row in orig_scores:
    idxs = np.argsort(row)[:2]
    weak_topics.append(", ".join([topic_list[i] for i in idxs]))

# reasons from raw non-academic values
raw_nonacad = nonacad.values
def reason(i):
    tips = [f"Focus on: {weak_topics[i]}."]
    att, part, hw, extra = raw_nonacad[i]
    if att < 75: tips.append("Improve attendance (≥75%).")
    if hw < 70: tips.append("Increase homework completion (≥70%).")
    if part < 5: tips.append("Participate more in class (≥5/10).")
    if extra > 6: tips.append("Reduce extracurricular load near exams.")
    return " ".join(tips)

recs = [reason(i) for i in range(len(pred_labels))]

out_df = pd.DataFrame({
    "StudentID": [idx[0] for idx in pivot.index],
    "Name": [idx[1] for idx in pivot.index],
    "PredictedMastery": pred_labels,
    "WeakTopics": weak_topics,
    "Recommendation": recs
})
out_df.to_excel(REPORT_PATH, index=False)

print("\n✅ Training finished.")
print(f"📦 Saved model -> {MODEL_PATH}")
print(f"🧠 Saved scalers/encoder -> {SEQ_SCALER_PATH}, {NONACAD_SCALER_PATH}, {LE_PATH}")
print(f"🧾 Saved meta -> {META_PATH}")
print(f"📈 Saved curves -> {TRAIN_CURVES_JSON}")
print(f"ℹ️  Saved model info -> {MODEL_INFO_JSON}")
print(f"📗 Predictions -> {REPORT_PATH}")
