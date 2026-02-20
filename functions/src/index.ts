import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import express from "express";
import cors from "cors";
import OpenAI from "openai";

// Firebase Admin SDK 초기화
admin.initializeApp();

const app = express();

// CORS 설정 - 모든 도메인에서의 요청을 허용합니다.
// 실제 프로덕션 환경에서는 특정 도메인만 허용하는 것이 더 안전합니다.
app.use(cors({ origin: true }));
app.use(express.json({ limit: "50mb" })); // 이미지 데이터 처리를 위해 용량 제한 늘리기

// OpenAI API 키 설정
// 실제 키는 Firebase 환경 변수에 저장합니다.
// functions.config().openai.key 와 같이 불러옵니다.
const openai = new OpenAI({
  apiKey: functions.config().openai.key,
});

const SYSTEM_PROMPT = `당신은 20년 이상 경력을 가진 농업 병해충 전문 진단가입니다.
사용자가 업로드한 작물 이미지를 분석하여 병해, 해충, 생리장해 여부를 진단합니다.

다음 원칙을 반드시 따르십시오:

1. 절대 단정하지 말고 "가능성이 높습니다", "추정됩니다" 등의 확률 기반 표현을 사용하십시오.
2. 이미지로 판단이 어려운 경우 반드시 추가로 필요한 정보를 요청하십시오.
   (예: 재배 작물명, 재배 지역, 최근 날씨, 증상 발생 시기 등)
3. 병해/해충/생리장해를 구분하여 설명하십시오.
4. 친환경 방제 방법과 일반 농약 방제 방법을 모두 제시하십시오.
5. 농약을 제시할 경우 반드시:
   - 계통
   - 작용 기작
   - 사용 시기
   - 희석 배수
   - 주의사항
   을 포함하십시오.
6. 농가 실전 대응 순서를 단계별로 정리하십시오.
7. 유사 증상과의 구분 포인트도 반드시 설명하십시오.
8. 최종적으로 재발 방지 관리 방법을 제시하십시오.
9. 위험한 농약 사용을 무책임하게 권장하지 마십시오.
10. 한국 농업 환경을 기준으로 설명하십시오.

출력 형식은 반드시 다음 구조를 따르십시오:

[1] 1차 진단 요약
[2] 의심 병해/해충 상세 설명
[3] 진단 근거
[4] 유사 증상과 구분법
[5] 방제 방법
   - 친환경 방제
   - 일반 약제 방제
[6] 긴급 대응 단계
[7] 재발 방지 관리법
[8] 추가로 필요한 정보 (있을 경우)

전문적이지만 농업인이 이해하기 쉽게 설명하십시오.`;

// POST /api/diagnose 엔드포인트
app.post("/diagnose", async (req, res) => {
  const { image, crop } = req.body;

  if (!image || !crop) {
    return res.status(400).send("이미지(image)와 작물명(crop) 데이터가 필요합니다.");
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `이 작물 이미지를 진단해주세요. 작물은 ${crop}입니다.`,
            },
            {
              type: "image_url",
              image_url: {
                url: image,
              },
            },
          ],
        },
      ],
    });

    res.status(200).json({ diagnosis: completion.choices[0].message.content });

  } catch (error: any) {
    console.error("OpenAI API 호출 중 오류 발생:", error);
    if (error.response) {
        console.error(error.response.status, error.response.data);
        res.status(error.response.status).send(error.response.data);
    } else {
        res.status(500).send("OpenAI API 처리 중 내부 서버 오류가 발생했습니다.");
    }
  }
});

// Express 앱을 Firebase Cloud Function으로 변환
// /api 엔드포인트로 들어오는 모든 요청을 app (Express 앱)이 처리
export const api = functions.region("asia-northeast3").https.onRequest(app);
