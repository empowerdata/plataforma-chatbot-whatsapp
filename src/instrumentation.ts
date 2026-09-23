/** Executado uma vez quando o servidor Next sobe: liga o monitor de números. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.DISABLE_MONITOR !== "1") {
    const { startMonitor } = await import("./server/monitor");
    startMonitor();
  }
}
