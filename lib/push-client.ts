export async function enablePush() {
  if (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  )
    throw new Error(
      "On iPhone, add DayHub to your Home Screen first. Push requires a supported browser and HTTPS.",
    );
  const r = await fetch("/api/push"),
    data = await r.json();
  if (!r.ok || !data.available)
    throw new Error(
      "Background push needs VAPID keys on the server. In-app notifications are already available.",
    );
  const permission = await Notification.requestPermission();
  if (permission !== "granted")
    throw new Error(
      "Notification permission was not granted. In-app alerts still work.",
    );
  const registration = await navigator.serviceWorker.ready;
  const base64 = data.publicKey.replace(/-/g, "+").replace(/_/g, "/");
  const key = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const subscription =
    (await registration.pushManager.getSubscription()) ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: key,
    }));
  const saved = await fetch("/api/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  });
  if (!saved.ok) throw new Error((await saved.json()).error);
  return "Background notifications are enabled on this device.";
}
export async function disablePush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window))
    return "This device has no push subscription.";
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return "Push is already disabled.";
  const res = await fetch("/api/push", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  });
  if (!res.ok)
    throw new Error("Unable to disable push on the server. Please retry.");
  await subscription.unsubscribe();
  return "Background push is disabled on this device.";
}
