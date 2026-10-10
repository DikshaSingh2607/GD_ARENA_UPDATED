let callQueue = Promise.resolve();

export function withLlmQueue(task) {
  const result = callQueue.then(task, task);
  callQueue = result.then(() => undefined, () => undefined);
  return result;
}

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error("cancelled"));
    const timer = setTimeout(done, ms);
    function done() {
      signal?.removeEventListener("abort", cancel);
      resolve();
    }
    function cancel() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      reject(new Error("cancelled"));
    }
    signal?.addEventListener("abort", cancel, { once: true });
  });
}

function endpoint() {
  const base = process.env.BUILT_IN_FORGE_API_URL || process.env.MANUS_API_URL;
  const key = process.env.BUILT_IN_FORGE_API_KEY || process.env.MANUS_API_KEY;
  if (!base || !key) {
    const error = new Error("The platform LLM service is not available to the server.");
    error.status = 503;
    throw error;
  }
  return { url: `${base.replace(/\/+$/, "")}/v1/chat/completions`, key };
}

function retryDelay(response, attempt) {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    const date = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(date)) return Math.max(0, Math.min(30_000, date));
  }
  return 500 * (2 ** attempt);
}

async function requestOnce(args, useResponseFormat, signal) {
  if (signal?.aborted) throw new Error("cancelled");
  const { url, key } = endpoint();
  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => controller.abort();
  signal?.addEventListener("abort", abortFromCaller, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 12_000);

  const body = {
    model: args.model,
    messages: args.messages,
    tools: [],
    max_completion_tokens: args.maxCompletionTokens,
    reasoning: args.reasoning,
  };
  // GPT-5 reasoning routes use their default sampling temperature; non-default
  // temperature values are rejected by some current proxy routes.
  if (!String(args.model).startsWith("gpt-5") && Number.isFinite(args.temperature)) body.temperature = args.temperature;
  if (useResponseFormat && args.responseFormat) body.response_format = args.responseFormat;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const raw = await response.text();
    let payload;
    try { payload = raw ? JSON.parse(raw) : {}; } catch { payload = {}; }
    return { response, payload };
  } catch (error) {
    if (signal?.aborted) throw new Error("cancelled");
    const failure = new Error(timedOut ? "The LLM request timed out after 12 seconds." : "The LLM service could not be reached.");
    failure.status = timedOut ? 504 : 502;
    throw failure;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abortFromCaller);
  }
}

async function callWithTransientRetry(args, useResponseFormat, signal) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { response, payload } = await requestOnce(args, useResponseFormat, signal);
    if ((response.status === 429 || response.status === 503) && attempt === 0) {
      await wait(retryDelay(response, attempt), signal);
      continue;
    }
    if (!response.ok) {
      const failure = new Error(`The LLM service returned HTTP ${response.status}.`);
      failure.status = response.status === 429 || response.status === 503 ? 503 : 502;
      throw failure;
    }
    if (payload?.error) {
      const upstreamMessage = typeof payload.error === "string" ? payload.error : String(payload.error?.message || payload.error?.type || "unknown upstream error");
      if (process.env.NODE_ENV !== "production") console.warn("GD Arena upstream LLM error:", upstreamMessage.slice(0, 350));
      const failure = new Error("The LLM service returned an error response.");
      failure.status = 502;
      throw failure;
    }
    return payload;
  }
  const failure = new Error("The LLM service remained temporarily unavailable.");
  failure.status = 503;
  throw failure;
}

function completionText(payload) {
  const value = payload?.choices?.[0]?.message?.content;
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map((part) => typeof part?.text === "string" ? part.text : "").join("\n").trim();
  return "";
}

export function chatCompletion(args, signal) {
  return withLlmQueue(async () => {
    let payload = await callWithTransientRetry(args, true, signal);
    let text = completionText(payload);
    // Some routes may return an empty completion for structured output. Retry once without
    // the format constraint as required by the platform contract, then parse/validate upstream.
    if (!text && args.responseFormat) {
      payload = await callWithTransientRetry(args, false, signal);
      text = completionText(payload);
    }
    if (!text) {
      const failure = new Error("The LLM returned no usable completion text.");
      failure.status = 502;
      throw failure;
    }
    return text;
  });
}
