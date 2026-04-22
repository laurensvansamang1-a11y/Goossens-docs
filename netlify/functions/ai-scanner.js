const { GoogleGenerativeAI } = require("@google/generative-ai");

exports.handler = async (event) => {
  // Beveiliging: Alleen POST-verzoeken toestaan
  if (event.httpMethod !== "POST") {
    return { 
      statusCode: 405, 
      body: JSON.stringify({ error: "Method Not Allowed" }) 
    };
  }

  try {
    // 1. Haal de API-sleutel op uit de Netlify-kluis
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return { 
        statusCode: 500, 
        body: JSON.stringify({ error: "Configuratiefout: GEMINI_API_KEY niet gevonden in Netlify." }) 
      };
    }

    // 2. Initialiseer de AI
    const genAI = new GoogleGenerativeAI(apiKey);

    /** * CRUCIALE FIX: 
     * We dwingen hier 'apiVersion: "v1"' af. 
     * Dit voorkomt de 404-fout op de oude v1beta-omgeving.
     */
    const model = genAI.getGenerativeModel(
      { model: "gemini-1.5-flash" },
      { apiVersion: "v1" }
    );

    // 3. Haal de gegevens uit het verzoek
    const { promptText, mimeType, base64Data } = JSON.parse(event.body);

    let result;

    if (base64Data && mimeType) {
      // Logica voor foto-analyse (Multimodaal)
      result = await model.generateContent([
        promptText,
        {
          inlineData: {
            data: base64Data,
            mimeType: mimeType,
          },
        },
      ]);
    } else {
      // Logica voor gewone tekst (Chat/Rapporten)
      result = await model.generateContent(promptText);
    }

    // 4. Wacht op het resultaat en pak de tekst
    const response = await result.response;
    const text = response.text();

    // 5. Stuur het resultaat terug naar de app
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*", // Voorkomt browser-blokkades
      },
      body: JSON.stringify({ result: text }),
    };

  } catch (error) {
    console.error("AI Scanner Fout:", error.message);
    
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: "Er liep iets mis bij de AI-verwerking.",
        details: error.message 
      }),
    };
  }
};
