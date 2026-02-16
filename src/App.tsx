import React, { useState, useRef, useCallback } from 'react';
import './App.css';

interface DiagnosisResult {
  diseaseName: string;
  confidence: number;
  recommendedActions: string;
  additionalInfo: string;
}

interface DiagnosisRecord {
  image: string;
  diagnosis: DiagnosisResult;
  timestamp: string;
}

function App() {
  const [image, setImage] = useState<string | null>(null);
  const [diagnosis, setDiagnosis] = useState<DiagnosisResult | null>(null);
  const [history, setHistory] = useState<DiagnosisRecord[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer.files && event.dataTransfer.files[0]) {
      const file = event.dataTransfer.files[0];
      const reader = new FileReader();
      reader.onload = (e) => {
        setImage(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setImage(e.target?.result as string);
      };
      reader.readAsDataURL(event.target.files[0]);
    }
  };

  const handleDiagnose = () => {
    // Mock AI Diagnosis
    const newDiagnosis: DiagnosisResult = {
      diseaseName: '감자잎마름병',
      confidence: 0.95,
      recommendedActions: '방제 약제를 살포하고, 감염된 잎은 제거하여 소각하세요.',
      additionalInfo: '이 병은 고온 다습한 환경에서 빠르게 확산됩니다. 통풍이 잘 되도록 관리해주세요.'
    };
    setDiagnosis(newDiagnosis);

    if (image) {
      const newRecord: DiagnosisRecord = {
        image,
        diagnosis: newDiagnosis,
        timestamp: new Date().toLocaleString(),
      };
      setHistory([newRecord, ...history]);
    }
  };

  const triggerFileUpload = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="container">
      <header>
        <h1>농작물 병해충 AI 진단</h1>
      </header>
      <main>
        <div className="upload-section">
          <div
            className="image-placeholder"
            onClick={triggerFileUpload}
            onDrop={handleImageDrop}
            onDragOver={handleDragOver}
            style={{
              backgroundImage: image ? `url(${image})` : 'none',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          >
            {!image && '여기를 클릭하거나 이미지를 드래그 앤 드롭하세요'}
          </div>
          <input
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            ref={fileInputRef}
            style={{ display: 'none' }}
          />
          <button onClick={handleDiagnose} disabled={!image}>
            진단하기
          </button>
        </div>
        {diagnosis && (
          <div className="results-section">
            <h2>진단 결과</h2>
            <div className="result-item">
              <strong>진단명:</strong> {diagnosis.diseaseName}
            </div>
            <div className="result-item">
              <strong>신뢰도:</strong> {(diagnosis.confidence * 100).toFixed(2)}%
            </div>
            <div className="result-item">
              <strong>권장 조치:</strong> {diagnosis.recommendedActions}
            </div>
            <div className="result-item">
              <strong>추가 정보:</strong> {diagnosis.additionalInfo}
            </div>
          </div>
        )}
        {history.length > 0 && (
          <div className="history-section">
            <h2>최근 진단 기록</h2>
            <ul>
              {history.map((record, index) => (
                <li key={index}>
                  <img src={record.image} alt="진단 이미지" />
                  <div>
                    <p><strong>진단명:</strong> {record.diagnosis.diseaseName}</p>
                    <span>{record.timestamp}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
