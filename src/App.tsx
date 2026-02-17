import { useState, useRef, useEffect } from 'react';
import OpenAI from 'openai';
import './App.css';

// Vite 환경 변수에서 API 키를 가져옵니다.
const apiKey = import.meta.env.VITE_OPENAI_API_KEY;

const openai = new OpenAI({
  apiKey: apiKey,
  dangerouslyAllowBrowser: true // 브라우저 환경에서 API 키 사용을 허용합니다.
});

function App() {
  const [image, setImage] = useState<string | null>(null);
  const [diagnosis, setDiagnosis] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [history, setHistory] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [crop, setCrop] = useState<string>('고추'); // 기본 작물 설정

  // 페이지 로드 시 로컬 스토리지에서 기록 불러오기
  useEffect(() => {
    const savedHistory = localStorage.getItem('diagnosisHistory');
    if (savedHistory) {
      setHistory(JSON.parse(savedHistory));
    }
  }, []);

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDiagnose = async () => {
    if (!image) return;

    setLoading(true);
    setDiagnosis('');

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: `이 ${crop} 작물 사진을 보고, 어떤 질병이나 해충 문제가 있는지 진단해줘. 만약 병해충이 확인되면, 어떤 유기농 및 화학적 방제법이 있는지 자세히 알려주고, 예상되는 원인도 함께 설명해줘. 만약 특별한 문제가 없다면, 작물의 상태가 양호하다고 알려줘.` },
              {
                type: "image_url",
                image_url: {
                  "url": image,
                },
              },
            ],
          },
        ],
      });

      const newDiagnosis = response.choices[0].message.content || '진단 결과를 받아올 수 없습니다.';
      setDiagnosis(newDiagnosis);

      // 진단 기록에 추가 및 로컬 스토리지에 저장
      const newHistoryItem = { 
        image, 
        diagnosis: newDiagnosis.split('\n')[0], // 요약만 저장
        date: new Date().toLocaleString()
      };
      const updatedHistory = [newHistoryItem, ...history];
      setHistory(updatedHistory);
      localStorage.setItem('diagnosisHistory', JSON.stringify(updatedHistory));

    } catch (error: any) {
      setDiagnosis(`오류가 발생했습니다: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (!apiKey) {
    return (
      <div className="container">
        <div className="api-key-missing">
          <h1>OpenAI API 키가 필요합니다</h1>
          <p>애플리케이션을 사용하려면 Cloudflare Pages 환경 변수에 <code>VITE_OPENAI_API_KEY</code>를 설정해야 합니다.</p>
          <p>API 키를 설정한 후 페이지를 새로고침해주세요.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <header>
        <div className="container">
          <h1>AI 농업 병해충 진단</h1>
        </div>
      </header>

      <main className="container">
        {/* 작물 선택 UI */}
        <div className="crop-selection-section">
          <label htmlFor="crop-select">진단할 작물을 선택하세요:</label>
          <select id="crop-select" value={crop} onChange={(e) => setCrop(e.target.value)}>
            <option value="고추">고추</option>
            <option value="토마토">토마토</option>
            <option value="오이">오이</option>
            <option value="딸기">딸기</option>
            <option value="포도">포도</option>
            <option value="사과">사과</option>
            {/* 필요에 따라 작물 추가 */}
          </select>
        </div>

        <div className="upload-section">
          <div 
            className={`image-placeholder ${image ? 'has-image' : ''}`}
            onClick={() => fileInputRef.current?.click()}
            style={{ backgroundImage: image ? `url(${image})` : 'none' }}
          >
            {!image && (
              <div className="placeholder-content">
                <span>클릭하여 작물 사진 업로드</span>
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
          <button onClick={handleDiagnose} disabled={!image || loading}>
            {loading ? (
              <>
                <div className="spinner"></div>
                <span>진단 중...</span>
              </> 
            ) : (
              '진단하기'
            )}
          </button>
        </div>
        
        {(loading || diagnosis) && (
          <div className="results-section">
            <h2>진단 결과</h2>
            {loading && !diagnosis && <div className="spinner-large"></div>} 
            <pre className="diagnosis-output">{diagnosis}</pre>
          </div>
        )}

        {history.length > 0 && (
          <div className="history-section">
            <h2>최근 진단 기록</h2>
            <ul>
              {history.map((item, index) => (
                <li key={index}>
                  <img src={item.image} alt="진단 이미지" />
                  <div className="history-info">
                    <p>{item.diagnosis}</p>
                    <span>{item.date}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

      </main>

      <footer>
        <div className="container">
          <p>&copy; {new Date().getFullYear()} AI 농업 병해충 진단. All Rights Reserved.</p>
        </div>
      </footer>
    </>
  );
}

export default App;