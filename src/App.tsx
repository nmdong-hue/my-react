
import { useState, useRef, useEffect, useCallback } from 'react';
import OpenAI from 'openai';
import { auth, db } from './firebase'; // Firebase auth and db import
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { doc, getDoc, setDoc, increment } from 'firebase/firestore';
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

// Type guard to check if an object is a valid HistoryItem
function isHistoryItem(item: unknown): item is Omit<HistoryItem, 'id'> & { id?: number } {
    const obj = item as HistoryItem;
    return (
        typeof obj === 'object' &&
        obj !== null &&
        (obj.image === null || typeof obj.image === 'string') &&
        typeof obj.diagnosis === 'string' &&
        typeof obj.date === 'string'
    );
}

// Constants for diagnosis limits
const GUEST_DIAGNOSIS_LIMIT = 5;
const USER_DIAGNOSIS_LIMIT = 20; // 로그인 사용자 기본 횟수
const MAX_HISTORY_ITEMS = 20;

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
        alert("저장 공간이 부족하여 진단 기록을 저장할 수 없습니다. 오래된 기록을 삭제하면 문제가 해결될 수 있습니다.");
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
  const [user, setUser] = useState<User | null>(null);
  const [diagnosisCount, setDiagnosisCount] = useState(0);
  const [diagnosisLimit, setDiagnosisLimit] = useState(GUEST_DIAGNOSIS_LIMIT);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');

  const updateUserState = useCallback(async (currentUser: User | null) => {
    if (currentUser) {
      const userRef = doc(db, "users", currentUser.uid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const userData = userSnap.data();
        setDiagnosisCount(userData.diagnosisCount || 0);
        if (userData.hasPaid) {
          setDiagnosisLimit(Infinity);
        } else {
          setDiagnosisLimit(userData.diagnosisLimit || USER_DIAGNOSIS_LIMIT);
        }
      } else {
        await setDoc(userRef, {
          email: currentUser.email,
          displayName: currentUser.displayName,
          diagnosisCount: 0,
          diagnosisLimit: USER_DIAGNOSIS_LIMIT,
          hasPaid: false, // 결제 상태 필드 추가
          createdAt: new Date(),
        });
        setDiagnosisCount(0);
        setDiagnosisLimit(USER_DIAGNOSIS_LIMIT);
      }
    } else {
      const guestCount = parseInt(localStorage.getItem('guestDiagnosisCount') || '0', 10);
      setDiagnosisCount(guestCount);
      setDiagnosisLimit(GUEST_DIAGNOSIS_LIMIT);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      updateUserState(currentUser);
    });
    return () => unsubscribe();
  }, [updateUserState]);

  useEffect(() => {
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    const savedHistory = localStorage.getItem('diagnosisHistory');
    if (savedHistory) {
      try {
        const parsed = JSON.parse(savedHistory);
        if(Array.isArray(parsed)) {
            const parsedHistory = parsed
                .filter(isHistoryItem)
                .map((item, index) => ({ ...item, id: item.id || Date.now() + index }));
            setHistory(parsedHistory.slice(0, MAX_HISTORY_ITEMS));
        }
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

  const handleGoogleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Google login error:", error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const processFile = async (file: File) => {
    if (file && file.type.startsWith('image/')) {
        try {
            const resizedImage = await resizeImage(file, 400);
            setImage(resizedImage);
            setDiagnosis(''); 
        } catch (error) {
            console.error("Image resizing failed:", error);
            const reader = new FileReader();
            reader.onloadend = () => { setImage(reader.result as string); };
            reader.readAsDataURL(file);
        }
    }
  };

  const handleReset = () => {
    setImage(null);
    setDiagnosis('');
    if(fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); };
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); };
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const handleDiagnose = async () => {
    if (!image || !openai) return;

    if (diagnosisCount >= diagnosisLimit) {
        const message = user
            ? "모든 진단 횟수를 소진했습니다. 추가 횟수를 원하시면 후원해주세요."
            : `무료 진단 횟수 ${GUEST_DIAGNOSIS_LIMIT}회를 모두 사용했습니다. 더 많은 기능을 이용하려면 로그인해주세요.`;
        alert(message);
        return;
    }

    setLoading(true);
    setDiagnosis('');

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "user", content: [
              { type: "text", text: `이 작물 사진을 보고, 어떤 질병이나 해충 문제가 있는지 진단해줘. 만약 병해충이 확인되면, 어떤 유기농 및 화학적 방제법이 있는지 자세히 알려주고, 예상되는 원인도 함께 설명해줘. 만약 특별한 문제가 없다면, 작물의 상태가 양호하다고 알려줘.` },
              { type: "image_url", image_url: { "url": image } },
          ]},\
        ],
      });

      const newDiagnosis = response.choices[0].message.content || '진단 결과를 받아올 수 없습니다.';
      setDiagnosis(newDiagnosis);

      if (user && diagnosisLimit !== Infinity) { // 유료 사용자는 횟수 증가 안함
        const userRef = doc(db, "users", user.uid);
        await setDoc(userRef, { diagnosisCount: increment(1) }, { merge: true });
        setDiagnosisCount(prev => prev + 1);
      } else if (!user) {
        localStorage.setItem('guestDiagnosisCount', (diagnosisCount + 1).toString());
        setDiagnosisCount(prev => prev + 1);
      }

      const newHistoryItem: HistoryItem = { id: Date.now(), image, diagnosis: newDiagnosis, date: new Date().toLocaleString() };
      const updatedHistory = [newHistoryItem, ...history].slice(0, MAX_HISTORY_ITEMS);
      setHistory(updatedHistory);
      saveHistoryToLocalStorage(updatedHistory);

    } catch (error) {
        let errorMessage = '알 수 없는 오류가 발생했습니다.';
        if (error instanceof Error) {
            errorMessage = error.message;
        }
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

  // 임시 결제 시뮬레이션 함수
  const handleSimulatePayment = async () => {
    if (!user) return;
    const userRef = doc(db, "users", user.uid);
    try {
        await setDoc(userRef, { hasPaid: true, diagnosisLimit: Infinity }, { merge: true });
        await updateUserState(user); // 상태를 즉시 업데이트
        alert("결제가 완료되었습니다! 이제 무제한으로 진단할 수 있습니다.");
    } catch (error) {
        console.error("Payment simulation failed:", error);
        alert("결제 처리 중 오류가 발생했습니다.");
    }
  };

  const isLimitReached = diagnosisCount >= diagnosisLimit;

  return (
    <>
      <header className="hero-section">
        <div className="header-controls">
            <div className="theme-toggle-container">
                <button onClick={toggleTheme} className="theme-toggle-button">
                {theme === 'light' ? '다크 모드' : '라이트 모드'}
                </button>
            </div>
            <div className="auth-controls">
                {user ? (
                <div className="user-info">
                    <img src={user.photoURL || ''} alt={user.displayName || 'User'} className="user-avatar" />
                    <span>{user.displayName}</span>
                    <button onClick={handleLogout} className="auth-button">로그아웃</button>
                </div>
                ) : (
                <button onClick={handleGoogleLogin} className="auth-button">Google 계정으로 로그인</button>
                )}
                <a href="https://polar.sh/nmdong-hue" className="polar-button" data-polar-button-after="Sponsor">
                    <img src="https://polar.sh/embed/avatars/nmdong-hue.svg" alt="nmdong-hue Polar profile"/>
                </a>
            </div>
        </div>
        <div className="container">
            <h1>AI 농업 전문가</h1>
            <p>작물 사진을 업로드하여 간편하게 병해충을 진단하고 해결책을 찾아보세요.</p>
            <div className="usage-info">
                남은 진단 횟수: {diagnosisLimit === Infinity ? '무제한' : `${Math.max(0, diagnosisLimit - diagnosisCount)} / ${diagnosisLimit}`}
                {user && diagnosisLimit !== Infinity && (
                    <button onClick={handleSimulatePayment} className="simulate-payment-button">
                        결제하여 무제한 이용하기 (시뮬레이션)
                    </button>
                )}
            </div>
        </div>
      </header>

      <div className="container">
        <div className="main-content">
          <div className="content-card upload-section">
            <h2>1. 사진 업로드</h2>
            <div 
              className={`image-placeholder ${isDragging ? 'dragging' : ''}`}
              onClick={() => !isLimitReached && fileInputRef.current?.click()}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              style={{ 
                  backgroundImage: image ? `url(${image})` : 'none',
                  cursor: isLimitReached ? 'not-allowed' : 'pointer'
              }}
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
              disabled={isLimitReached}
            />
            <div className="upload-actions">
                <button onClick={handleDiagnose} disabled={!image || loading || isLimitReached} className="action-button">
                {loading ? (
                    <><div className="spinner"></div><span>진단 중...</span></>
                ) : isLimitReached ? (
                    '횟수 소진'
                ) : (
                    '진단하기'
                )}
                </button>
                {image && !loading && (
                    <button onClick={handleReset} className="clear-button">초기화</button>
                )}
            </div>
            {isLimitReached && (
                <div className="limit-message">
                    {user
                        ? "모든 진단 횟수를 소진했습니다. 결제를 통해 무제한으로 이용해 보세요!"
                        : `무료 진단 횟수 ${GUEST_DIAGNOSIS_LIMIT}회를 모두 사용했습니다. 로그인하고 더 많은 혜택을 받으세요!`}
                </div>
            )}
          </div>

          <div className="content-card results-section">
            <div className="card-header">
                <h2>2. 진단 결과</h2>
                {(diagnosis || loading) && (
                    <button onClick={handleReset} className="reset-button-header">초기화</button>
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
                    <button className="history-delete-button" onClick={(e) => handleDeleteHistoryItem(e, item.id)}>&times;</button>
                  </div>
                </li>
              ))}\
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
          <p>&copy; {new Date().getFullYear()} AI 농업 전문가. 모든 권리 보유.</p>
        </div>
      </footer>
    </>
  );
}

export default App;
