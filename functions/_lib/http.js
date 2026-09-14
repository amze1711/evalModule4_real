export function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json;charset=utf-8" },
  });
}

export async function readJsonBody(request) {
  try {
    return await request.json();
  } catch (e) {
    return null;
  }
}
