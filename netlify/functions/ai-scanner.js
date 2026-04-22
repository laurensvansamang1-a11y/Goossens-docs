const { GoogleGenerativeAI } = require("@google/generative-ai");

exports.handler = async (event) => {
  // Alleen POST verzoeken toestaan
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    // 1. Haal de API Key veilig op uit de Netlify omgeving
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is niet geconfigureerd in Netlify.");
    }

    // 2. Initialiseer Gemini
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // 3. Haal de data uit het verzoek van je App
    const { promptText, mimeType, base64Data } = JSON.parse(event.body);

    let result;

    if (base64Data && mimeType) {
      // Analyseer foto + tekst
      result = await model.generateContent([
        promptText,
        { inlineData: { data: base64Data, mimeType } }
      ]);
    } else {
      // Alleen tekst chat
      result = await model.generateContent(promptText);
    }

    const responseText = result.response.text();

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ result: responseText }),
    };

  } catch (error) {
    console.error("Fout in AI-Function:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
