const Alexa = require('ask-sdk-core');
const AWS = require('aws-sdk');
require('dotenv').config();
const EmailSender = process.env.EmailSender;
const RoleArn = process.env.RoleArn;
const SESRegion = process.env.SESRegion;

const LaunchRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
    },
    handle(handlerInput) {
        const speakOutput = 'こんにちは。メールして、と言ってみてください。';
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

const SendEmailItentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'SendEmailIntent';
    },
    async handle(handlerInput) {
        const emailAddress = await getEmailAddress(handlerInput);

        if (emailAddress) {
            await sendEmail(emailAddress);

            return handlerInput.responseBuilder
                .speak('Eメールを送信しました。')
                .withShouldEndSession(true)
                .getResponse();
        }
        else {
            return handlerInput.responseBuilder
                .speak('Eメールへのアクセス権が必要です。アレクサ・アプリに、アクセス権を求めるカードを送ったので、許可をお願いします。')
                .withAskForPermissionsConsentCard(['alexa::profile:email:read'])
                .withShouldEndSession(true)
                .getResponse();
        }
    }
};

const getEmailAddress = async (handlerInput) => {
    try {
        const upsServiceClient = handlerInput.serviceClientFactory.getUpsServiceClient();
        const emailAddress = await upsServiceClient.getProfileEmail();

        return emailAddress;
    }
    catch (error) {
        if (error.name === 'ServiceError') {
            if (error.statusCode === 403) {
                return null;
            }
        }

        throw error;
    }
}

const sendEmail = async (emailAddress) => {
    const params = {
        Source: EmailSender,
        Destination: {
            ToAddresses: [emailAddress],
        },
        Message: {
            Subject: {
                Data: 'テストメール',
                Charset: 'UTF-8'
            },
            Body: {
                Text: {
                    Data: 'こんにちは\nAlexaからのテストメールです。',
                    Charset: 'UTF-8'
                }
            }
        }
    };

    const STS = new AWS.STS({ apiVersion: '2011-06-15' });
    const assumeResp = await STS.assumeRole({
        RoleArn: RoleArn,
        RoleSessionName: 'SendEmailRoleSession'
    }, (err, res) => {
        if (err) {
            console.log('AssumeRole FAILED: ', err);
            throw new Error('Error while assuming role');
        }

        return res;
    }).promise();

    const credentials = {
        secretAccessKey: assumeResp.Credentials.SecretAccessKey,
        accessKeyId: assumeResp.Credentials.AccessKeyId,
        sessionToken: assumeResp.Credentials.SessionToken
    };

    const ses = new AWS.SES({
        apiVersion: '2010-12-01',
        credentials: credentials,
        region: SESRegion
    });

    const response = await ses.sendEmail(params).promise();

    console.log(JSON.stringify(response));
}

const SessionEndedRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
    },
    handle(handlerInput) {
        // Any cleanup logic goes here.
        return handlerInput.responseBuilder.getResponse();
    }
};

// The intent reflector is used for interaction model testing and debugging.
// It will simply repeat the intent the user said. You can create custom handlers
// for your intents by defining them above, then also adding them to the request
// handler chain below.
const IntentReflectorHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest';
    },
    handle(handlerInput) {
        const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
        const speakOutput = `You just triggered ${intentName}`;

        return handlerInput.responseBuilder
            .speak(speakOutput)
            //.reprompt('add a reprompt if you want to keep the session open for the user to respond')
            .getResponse();
    }
};

// Generic error handling to capture any syntax or routing errors. If you receive an error
// stating the request handler chain is not found, you have not implemented a handler for
// the intent being invoked or included it in the skill builder below.
const ErrorHandler = {
    canHandle() {
        return true;
    },
    handle(handlerInput, error) {
        console.log(`~~~~ Error handled: ${error.stack}`);
        const speakOutput = `Sorry, I had trouble doing what you asked. Please try again.`;

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

// The SkillBuilder acts as the entry point for your skill, routing all request and response
// payloads to the handlers above. Make sure any new handlers or interceptors you've
// defined are included below. The order matters - they're processed top to bottom.
const handlers = Alexa.SkillBuilders.custom()
    .addRequestHandlers(
        LaunchRequestHandler,
        SendEmailItentHandler,
        SessionEndedRequestHandler,
        IntentReflectorHandler, // make sure IntentReflectorHandler is last so it doesn't override your custom intent handlers
    )
    .addErrorHandlers(
        ErrorHandler,
    )
    .withApiClient(new Alexa.DefaultApiClient());

exports.skill = handlers.create();
exports.handler = handlers.lambda();