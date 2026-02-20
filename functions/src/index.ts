/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import {setGlobalOptions} from "firebase-functions";
import {onRequest} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";

// Firebase Admin SDK 초기화
admin.initializeApp();

setGlobalOptions({ maxInstances: 10 });

/**
 * Polar.sh로부터 웹훅을 수신하여 사용자의 결제 상태를 업데이트하는 함수
 */
export const polarWebhook = onRequest({cors: true}, async (request, response) => {
    logger.info("Polar Webhook received!", {body: request.body});

    try {
        // TODO: Polar 웹훅 시그니처 검증 (보안 강화)
        // const signature = request.headers["polar-signature"];
        // const secret = process.env.POLAR_WEBHOOK_SECRET;
        // 여기에 시그니처를 검증하는 로직이 들어갑니다.

        const event = request.body;

        // pledge_created 이벤트와 네임스페이스가 일치하는지 확인
        if (event.type === 'pledge_created' && event.payload.pledge.pledge_tier.organization.name.toLowerCase() === 'nmdong-hue') {
            const customerEmail = event.payload.pledge.pledger.email;
            logger.info(`Processing payment for email: ${customerEmail}`);

            // 이메일을 기반으로 Firestore에서 사용자 검색
            const usersRef = admin.firestore().collection('users');
            const query = usersRef.where('email', '==', customerEmail).limit(1);
            const userSnapshot = await query.get();

            if (userSnapshot.empty) {
                logger.warn(`User with email ${customerEmail} not found.`);
                response.status(404).send("User not found");
                return;
            }

            // 사용자의 hasPaid 상태 업데이트
            const userDoc = userSnapshot.docs[0];
            await userDoc.ref.update({
                hasPaid: true,
                diagnosisLimit: Infinity, // 무제한으로 설정
            });

            logger.info(`Successfully updated user ${userDoc.id} to paid status.`);
            response.status(200).send("User updated successfully.");
        } else {
            logger.info("Irrelevant event type or namespace, skipping.");
            response.status(200).send("Event skipped");
        }

    } catch (error) {
        logger.error("Error processing Polar webhook:", error);
        if (error instanceof Error) {
            response.status(500).send(`Webhook Error: ${error.message}`);
        } else {
            response.status(500).send("An unknown error occurred");
        }
    }
});
