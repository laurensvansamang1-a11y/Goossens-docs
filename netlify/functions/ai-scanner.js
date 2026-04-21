exports.handler = async function(event, context) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Alleen POST toegestaan" };
  }

  const rawKey = process.env.GEMINI_API_KEY || "";
  const apiKey = rawKey.replace(/['"\s\r\n]/g, ""); 

  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "Sleutel ontbreekt op de server." }) };
  }

  try {
    const { promptText, mimeType, base64Data, forceJson } = JSON.parse(event.body);
    
    // DE FIX: Terug naar het actuele 2.5 model dat werkt voor jouw account!
    const model = "gemini-2.5-flash"; 
    const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`;

    const generationConfig = forceJson ? { responseMimeType: "application/json" } : {};

    let apiBody = {
      contents: [{ role: "user", parts: [{ text: promptText }] }],
      generationConfig
    };

    if (base64Data) {
      apiBody.contents[0].parts.push({
        inlineData: { mimeType: mimeType, data: base64Data }
      });
    }

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(apiBody)
    });

    const data = await response.json();

    if (!response.ok) {
      return { statusCode: response.status, body: JSON.stringify({ error: data.error?.message || "Google API Fout." }) };
    }

    const textResult = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    return { statusCode: 200, body: JSON.stringify({ result: textResult }) };

  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: `Serverfout: ${error.message}` }) };
  }
};
