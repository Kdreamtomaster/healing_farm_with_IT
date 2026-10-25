// 내 스마트팜 DAG 를 진짜 Apache Airflow 파이썬 코드 모양으로 바꿔 보여 줘요 (참고용 글자).
// 농장 블록(PlantOperator 같은 것)은 진짜 Airflow 에는 없어서, 실제로는 PythonOperator 등으로 만들어요.
import { BLOCKS, POKE_MINUTES, SENSOR_TIMEOUT } from "./blocks.js";
import { dailyMinute } from "./runner.js";
import { topoOrder } from "./dag.js";

const py = (value) => (typeof value === "number" ? String(value) : JSON.stringify(String(value)));

export function toAirflow(dag) {
  const minute = dailyMinute(dag.schedule);
  const schedule = minute === null ? "None  # 수동 실행" : `"${minute % 60} ${Math.floor(minute / 60)} * * *"  # 매일 ${dag.schedule.slice(6)}`;
  const lines = [
    `# 힐링 농장 스마트팜 "${dag.name}" 을 Airflow 모양으로 (참고용)`,
    "from datetime import datetime, timedelta",
    "",
    "from airflow import DAG",
    "from airflow.utils.trigger_rule import TriggerRule",
    "",
    "with DAG(",
    `    dag_id=${py(dag.id)},`,
    `    schedule=${schedule},`,
    "    start_date=datetime(2026, 1, 1),",
    "    catchup=False,",
    ") as dag:",
  ];
  const order = topoOrder(dag) ?? dag.tasks.map((t) => t.id);
  for (const id of order) {
    const task = dag.tasks.find((t) => t.id === id);
    const block = BLOCKS[task.block];
    const args = [`task_id=${py(task.id)}`, ...Object.entries({ ...block.params, ...task.params }).filter(([, v]) => v !== "").map(([k, v]) => `${k}=${py(v)}`)];
    if (block.sensor) args.push(`poke_interval=timedelta(minutes=${POKE_MINUTES})`, `timeout=timedelta(minutes=${SENSOR_TIMEOUT})`);
    if (task.retries) args.push(`retries=${task.retries}`, `retry_delay=timedelta(minutes=${task.retryDelay ?? 30})`);
    if (task.trigger === "none_failed") args.push("trigger_rule=TriggerRule.NONE_FAILED");
    lines.push(`    ${task.id} = ${block.airflow}(${args.join(", ")})`);
  }
  if (dag.edges.length) lines.push("");
  for (const [from, to] of dag.edges) lines.push(`    ${from} >> ${to}`);
  return lines.join("\n");
}
