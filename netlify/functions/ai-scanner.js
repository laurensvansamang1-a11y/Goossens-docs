const { GoogleGenerativeAI } = require("@google/generative-ai");

exports.handler = async (event) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    const genAI = new GoogleGenerativeAI(apiKey);

    // STAP 1: Vraag aan Google welke modellen beschikbaar zijn voor jouw sleutel
    // We gebruiken v1beta omdat die de meest complete lijst geeft
    const responseModels = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const modelsData = await responseModels.json();
    
    // We zoeken een werkend model in jouw lijst
    const availableModels = modelsData.models || [];
    const hasFlash = availableModels.find(m => m.name.includes("gemini-1.5-flash"));
    const hasPro = availableModels.find(m => m.name.includes("gemini-1.5-pro"));

    // Bepaal de exacte modelnaam die Google van jou verwacht
    // We geven voorkeur aan flash, dan pro, anders de eerste uit de lijst
    const targetModel = hasFlash ? hasFlash.name : (hasPro ? hasPro.name : availableModels[0]?.name);

    if (!targetModel) {
       throw new Error("Geen enkel model beschikbaar voor deze API key. Check je Google AI Studio.");
    }

    // STAP 2: Initialiseer het model met de exacte naam die Google ons net gaf
    // We laten de apiVersion even weg zodat de library zelf de beste kiest
    const model = genAI.getGenerativeModel({ model: targetModel.replace('models/', '') });

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
      body: JSON.stringify({ error: `Diagnose: ${error.message}` }),
    };
  }
};
