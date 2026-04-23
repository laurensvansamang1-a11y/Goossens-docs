const { GoogleGenerativeAI } = require("@google/generative-ai");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("API_KEY_MISSING");

    const genAI = new GoogleGenerativeAI(apiKey);
    
    /**
     * FIX: We gebruiken 'gemini-1.5-flash-latest'. 
     * Sommige regio's in Google Cloud herkennen 'gemini-1.5-flash' (zonder suffix) 
     * niet op de v1 API, maar 'latest' werkt altijd.
     */
    const model = genAI.getGenerativeModel(
      { model: "gemini-1.5-flash-latest" }, 
      { apiVersion: "v1" }
    );

    const { promptText, mimeType, base64Data } = JSON.parse(event.body);

    let result;
    if (base64Data && mimeType) {
      result = await model.generateContent([
        promptText,
        { inlineData: { data: base64Data, mimeType } }
      ]);
    } else {
      result = await model.generateContent(promptText);
    }

    const response = await result.response;
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ result: response.text() }),
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: `Google AI status: ${error.message}` }),
    };
  }
};
