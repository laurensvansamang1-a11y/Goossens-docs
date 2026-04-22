const { GoogleGenerativeAI } = require("@google/generative-ai");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("API_KEY_MISSING");

    const genAI = new GoogleGenerativeAI(apiKey);
    
    // We dwingen hier de stabiele API-versie af. 
    // Dit is vaak de oplossing voor de 'location not supported' fout op cloud-servers.
    const model = genAI.getGenerativeModel(
      { model: "gemini-1.5-flash" },
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
    console.error("Gedetailleerde Fout:", error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: `Locatie/Toegangsfout: ${error.message}` }),
    };
  }
};
