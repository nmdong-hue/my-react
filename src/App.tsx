
import { useState, useRef, useEffect } from 'react';
import OpenAI from 'openai';
import './App.css';

const apiKey = import.meta.env.VITE_OPENAI_API_KEY;

let openai: OpenAI | null = null;
if (apiKey) {
  openai = new OpenAI({
    apiKey: apiKey,
    dangerouslyAllowBrowser: true,
  });
}

type HistoryItem = {
  id: number;
  image: string | null; 
  diagnosis: string;
  date: string;
};

const MAX_HISTORY_ITEMS = 20;

// Helper function to resize an image
const resizeImage = (file: File, maxWidth: number): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const scale = maxWidth / img.width;
        canvas.width = maxWidth;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.8));
        } else {
          reject('Failed to get canvas context');
        }
      };
      img.onerror = reject;
      img.src = event.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

const saveHistoryToLocalStorage = (history: HistoryItem[]) => {
  try {
    localStorage.setItem('diagnosisHistory', JSON.stringify(history));
  } catch (error) {
    console.error("Could not save history to localStorage:", error);
    if (error instanceof DOMException && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
        alert("저장 공간가 부족하여 진단 기록을 저장할 수 없습니다. 오래된 기록을 삭제하면 문제가 해결될 수 있습니다.");
    }
  }
};

function ApiKeyMissing() {
  return (
    <div className="container">
      <div className="api-key-missing content-card">
        <h2>OpenAI API 키가 필요합니다</h2>
        <p>이 애플리케이션을 사용하려면 먼저 환경 변수를 설정해야 합니다.</p>
        <p>프로젝트 설정에서 다음 환경 변수를 추가하세요:</p>
        <p><strong>이름:</strong> <code>VITE_OPENAI_API_KEY</code></p>
        <p><strong>값:</strong> <code>sk-...</code>로 시작하는 OpenAI API 키</p>
      </div>
    </div>
  );
}

function App() {
  const [image, setImage] = useState<string | null>(null);
  const [diagnosis, setDiagnosis] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<HistoryItem | null>(null);
  const [theme, setTheme] = useState(() => {
    const savedTheme = localStorage.getItem('theme');
    return savedTheme || 'light';
  });

  useEffect(() => {
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    const savedHistory = localStorage.getItem('diagnosisHistory');
    if (savedHistory) {
      try {
        const parsedHistory = JSON.parse(savedHistory).map((item: any, index: number) => ({
          ...item,
          id: item.id || Date.now() + index,
        }));
        setHistory(parsedHistory.slice(0, MAX_HISTORY_ITEMS));
      } catch (e) {
        console.error("Error parsing history, clearing it.", e);
        localStorage.removeItem('diagnosisHistory');
      }
    }
  }, []);

  const toggleTheme = () => {
    setTheme(prevTheme => (prevTheme === 'light' ? 'dark' : 'light'));
  };

  if (!apiKey || !openai) {
    return <ApiKeyMissing />;
  }

  const processFile = async (file: File) => {
    if (file && file.type.startsWith('image/')) {
        try {
            const resizedImage = await resizeImage(file, 400);
            setImage(resizedImage);
            setDiagnosis(''); // Clear previous diagnosis
        } catch (error) {
            console.error("Image resizing failed:", error);
            const reader = new FileReader();
            reader.onloadend = () => {
                setImage(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    }
  };

  const handleReset = () => {
    setImage(null);
    setDiagnosis('');
    if(fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const handleDiagnose = async () => {
    if (!image || !openai) return;

    setLoading(true);
    setDiagnosis('');

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: `이 작물 사진을 보고, 어떤 질병이나 해충 문제가 있는지 진단해줘. 만약 병해충이 확인되면, 어떤 유기농 및 화학적 방제법이 있는지 자세히 알려주고, 예상되는 원인도 함께 설명해줘. 만약 특별한 문제가 없다면, 작물의 상태가 양호하다고 알려줘.` },
              { type: "image_url", image_url: { "url": image } },
            ],
          },
        ],
      });

      const newDiagnosis = response.choices[0].message.content || '진단 결과를 받아올 수 없습니다.';
      setDiagnosis(newDiagnosis);

      const newHistoryItem: HistoryItem = { 
        id: Date.now(),
        image, 
        diagnosis: newDiagnosis,
        date: new Date().toLocaleString()
      };
      
      const updatedHistory = [newHistoryItem, ...history].slice(0, MAX_HISTORY_ITEMS);
      setHistory(updatedHistory);
      
      saveHistoryToLocalStorage(updatedHistory);

    } catch (error: any) {
      const errorMessage = error.message || '알 수 없는 오류가 발생했습니다.';
      setDiagnosis(`오류가 발생했습니다: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteHistoryItem = (e: React.MouseEvent, idToDelete: number) => {
    e.stopPropagation();
    if (window.confirm("이 진단 기록을 정말 삭제하시겠습니까?")) {
      const updatedHistory = history.filter(item => item.id !== idToDelete);
      setHistory(updatedHistory);
      saveHistoryToLocalStorage(updatedHistory);
      if (selectedHistoryItem?.id === idToDelete) {
        setSelectedHistoryItem(null);
      }
    }
  };

  return (
    <>
      <header className="hero-section">
         <div className="theme-toggle-container">
          <button onClick={toggleTheme} className="theme-toggle-button">
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
        </div>
        <div className="container">
          <h1>AI 농업 전문가</h1>
          <p>작물 사진을 업로드하여 간편하게 병해충을 진단하고 해결책을 찾아보세요.</p>
        </div>
      </header>

      <div className="container">
        <div className="main-content">
          <div className="content-card upload-section">
            <h2>1. 사진 업로드</h2>
            <div 
              className={`image-placeholder ${isDragging ? 'dragging' : ''}`}
              onClick={() => fileInputRef.current?.click()}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              style={{ backgroundImage: image ? `url(${image})` : 'none' }}
            >
              {!image && (
                <div className="placeholder-content">
                   <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
                  <span>클릭 또는 드래그하여 작물 사진 업로드</span>
                </div>
              )}
            </div>
            <input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              ref={fileInputRef}
              style={{ display: 'none' }}
            />
            <div className="upload-actions">
                <button onClick={handleDiagnose} disabled={!image || loading} className="action-button">
                {loading ? (
                    <>
                    <div className="spinner"></div>
                    <span>진단 중...</span>
                    </>
                ) : (
                    '진단하기'
                )}
                </button>
                {image && !loading && (
                    <button onClick={handleReset} className="clear-button">
                        초기화
                    </button>
                )}
            </div>
          </div>

          <div className="content-card results-section">
            <div className="card-header">
                <h2>2. 진단 결과</h2>
                {(diagnosis || loading) && (
                    <button onClick={handleReset} className="reset-button-header">
                        초기화
                    </button>
                )}
            </div>
            {(loading || diagnosis) ? (
                <>
                    {loading && !diagnosis && <div className="spinner-large"></div>}
                    {diagnosis && image && (
                        <img src={image} alt="진단 이미지" className="result-image" />
                    )}
                    <pre className="diagnosis-output">{diagnosis}</pre>
                </>
            ) : (
                <div className="placeholder-content" style={{height: '100%', justifyContent: 'center'}}>
                    <p>사진을 업로드하고 진단 버튼을 누르면 여기에 결과가 표시됩니다.</p>
                </div>
            )}
          </div>
        </div>

        {history.length > 0 && (
          <div className="content-card history-section">
            <h2>최근 진단 기록</h2>
            <ul>
              {history.map((item) => (
                <li key={item.id} onClick={() => setSelectedHistoryItem(item)}>
                  {item.image ? (
                    <img src={item.image} alt="진단 이미지" />
                  ) : (
                    <div className="history-image-placeholder"></div>
                  )}
                  <div className="history-info">
                    <div className="history-text">
                        <p>{item.diagnosis.substring(0, 80)}...</p>
                        <span>{item.date}</span>
                    </div>
                    <button className="history-delete-button" onClick={(e) => handleDeleteHistoryItem(e, item.id)}>
                        &times;
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {selectedHistoryItem && (
        <div className="modal-backdrop" onClick={() => setSelectedHistoryItem(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-button" onClick={() => setSelectedHistoryItem(null)}>&times;</button>
            {selectedHistoryItem.image ? (
                <img src={selectedHistoryItem.image} alt="진단 이미지" className="modal-image" />
            ) : (
                <div className="modal-image-placeholder"></div>
            )}
            <div className="modal-diagnosis">
                <h2>상세 진단 결과</h2>
                <pre>{selectedHistoryItem.diagnosis}</pre>
                <span>진단 일시: {selectedHistoryItem.date}</span>
            </div>
          </div>
        </div>
      )}

      <footer>
        <div className="container">
          <p>&copy; {new Date().getFullYear()} AI 농업 전문가. All Rights Reserved.</p>
        </div>
      </footer>
    </>
  );
}

export default App;
