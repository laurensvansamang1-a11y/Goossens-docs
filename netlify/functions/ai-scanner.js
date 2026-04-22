const { GoogleGenerativeAI } = require("@google/generative-ai");

exports.handler = async (event) => {
  // Beveiliging: Alleen POST toestaan
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return { statusCode: 500, body: JSON.stringify({ error: "API Key niet gevonden in Netlify." }) };
    }

    // Initialiseer de AI
    const genAI = new GoogleGenerativeAI(apiKey);
    
    // We gebruiken het stabiele model. De nieuwste SDK (0.21.0) pakt nu automatisch de v1 route.
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const { promptText, mimeType, base64Data } = JSON.parse(event.body);

    let result;
    if (base64Data && mimeType) {
      // Foto + Tekst analyse
      result = await model.generateContent([
        promptText,
        { inlineData: { data: base64Data, mimeType } }
      ]);
    } else {
      // Alleen tekst chat
      result = await model.generateContent(promptText);
    }

    // Wacht op de volledige reactie
    const response = await result.response;
    const text = response.text();

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        // Dit zorgt ervoor dat je browser niet klaagt over CORS
        "Access-Control-Allow-Origin": "*" 
      },
      body: JSON.stringify({ result: text }),
    };

  } catch (error) {
    console.error("Gedetailleerde AI Fout:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
