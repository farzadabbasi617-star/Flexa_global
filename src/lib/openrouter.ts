/**
 * OpenRouter Client for Flexa AI
 */

export async function askOpenRouter(prompt: string, systemPrompt: string = "You are Flexa AI.") {
  const apiKey = process.env.OPENROUTER_API_KEY;
  
  if (!apiKey) {
    console.warn("OPENROUTER_API_KEY is missing. AI features will be limited.");
    return null;
  }

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://flexa.com", // Optional, for OpenRouter analytics
        "X-Title": "Flexa App", // Optional, for OpenRouter analytics
      },
      body: JSON.stringify({
        "model": "google/gemini-2.0-flash-exp:free",
        "messages": [
          { "role": "system", "content": systemPrompt },
          { "role": "user", "content": prompt }
        ],
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("OpenRouter API Error:", errorData);
      return null;
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || null;
  } catch (error) {
    console.error("OpenRouter Fetch Error:", error);
    return null;
  }
}
