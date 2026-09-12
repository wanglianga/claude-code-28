<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { api, fmtDate, fmtDateTime } from '../../api';
import { useAuthStore } from '../../stores/auth';
import type { PromotionData, StageReport, Timeline, Renewal } from '../../types';
import GrowthPanel from '../../components/GrowthPanel.vue';
import RadarChart from '../../components/RadarChart.vue';

const route = useRoute();
const auth = useAuthStore();
const studentId = Number(route.params.id);

const tab = ref<'growth' | 'eval' | 'timeline' | 'report' | 'biz'>('growth');
const student = ref<any>(null);
const promo = ref<PromotionData | null>(null);
const timeline = ref<Timeline | null>(null);
const reports = ref<StageReport[]>([]);
const renewals = ref<Renewal[]>([]);
const evaluations = ref<any[]>([]);
const error = ref('');
const notice = ref('');

// 评估表单
const evalPeriod = ref('2026年秋季阶段');
const evalSummary = ref('');
const evalCoop = ref('积极配合');
const evalWill = ref('一般');
const evalDecision = ref('promote');
const evalRationale = ref('');
const submitting = ref(false);

// 事件 / 沟通 / 续费表单
const newEvent = ref({ type: 'note', title: '', detail: '' });
const newComm = ref({ channel: '微信', content: '', risk_level: 'low' });
const newRenewal = ref({ suggestion: '', package: '' });
const reportPeriod = ref('2026年秋季阶段');
const activeReport = ref<StageReport | null>(null);

const decisionLabel = computed(() => {
  const map: Record<string, string> = {};
  (auth.meta?.decisions || []).forEach((d) => { map[d.key] = d.label; });
  return (k: string) => map[k] || k;
});
const eventLabel = computed(() => {
  const map: Record<string, string> = {};
  (auth.meta?.eventTypes || []).forEach((t) => { map[t.key] = t.label; });
  return (k: string) => map[k] || k;
});

async function loadAll() {
  error.value = '';
  try {
    [student.value, promo.value, timeline.value, reports.value, renewals.value, evaluations.value] =
      await Promise.all([
        api(`/api/students/${studentId}`),
        api(`/api/students/${studentId}/promotion-data`),
        api(`/api/students/${studentId}/timeline`),
        api(`/api/students/${studentId}/stage-reports`),
        api(`/api/students/${studentId}/renewals`),
        api(`/api/students/${studentId}/evaluations`),
      ]);
    // 预填评估表单
    if (promo.value) {
      evalWill.value = promo.value.student.child_willingness || '一般';
      const t = promo.value.recentReviews[0];
      evalSummary.value = t ? `${t.teacher_name}：${t.suggestion}` : '';
    }
  } catch (e: any) {
    error.value = e.message;
  }
}
onMounted(loadAll);

const radarSeries = computed(() => {
  if (!promo.value) return [];
  const gc = promo.value.goalComparison;
  return [
    { name: '阶段均分', values: gc.map((g) => g.avg), color: '#e07856' },
    { name: '同龄段目标', values: gc.map((g) => g.target ?? 0), color: '#2f6f6a', dashed: true },
  ];
});
const radarLabels = computed(() => promo.value?.goalComparison.map((g) => g.label) || []);
const metCount = computed(() => promo.value?.goalComparison.filter((g) => g.met).length ?? 0);

async function submitEval() {
  if (!evalRationale.value.trim()) { error.value = '请填写评估理由'; return; }
  submitting.value = true;
  error.value = '';
  try {
    await api(`/api/students/${studentId}/evaluations`, {
      method: 'POST',
      body: {
        period: evalPeriod.value,
        attendance_rate: promo.value?.attendance.rate ?? 0,
        homework_rate: promo.value?.homework.rate ?? 0,
        teacher_summary: evalSummary.value,
        parent_cooperation: evalCoop.value,
        child_willingness: evalWill.value,
        goal_comparison: promo.value?.goalComparison ?? [],
        decision: evalDecision.value,
        rationale: evalRationale.value,
      },
    });
    notice.value = '升班评估已保存';
    evalRationale.value = '';
    await loadAll();
  } catch (e: any) {
    error.value = e.message;
  } finally {
    submitting.value = false;
  }
}

async function addEvent() {
  if (!newEvent.value.title.trim()) { error.value = '请填写事件标题'; return; }
  await api(`/api/students/${studentId}/events`, { method: 'POST', body: newEvent.value });
  newEvent.value = { type: 'note', title: '', detail: '' };
  notice.value = '事件已记录';
  await loadAll();
}

async function addComm() {
  if (!newComm.value.content.trim()) { error.value = '请填写沟通内容'; return; }
  await api(`/api/students/${studentId}/communications`, { method: 'POST', body: newComm.value });
  newComm.value = { channel: '微信', content: '', risk_level: 'low' };
  notice.value = '沟通记录已保存';
  await loadAll();
}

async function addRenewal() {
  if (!newRenewal.value.suggestion.trim()) { error.value = '请填写续费建议'; return; }
  await api(`/api/students/${studentId}/renewals`, { method: 'POST', body: newRenewal.value });
  newRenewal.value = { suggestion: '', package: '' };
  notice.value = '续费建议已录入（将与教学证据分开呈现）';
  await loadAll();
}

async function genReport() {
  const r = await api(`/api/students/${studentId}/stage-reports`, {
    method: 'POST', body: { period: reportPeriod.value },
  });
  notice.value = `已生成「${r.period}」阶段说明`;
  await loadAll();
  activeReport.value = reports.value[0];
}

interface TlEntry { d: string; kind: string; label: string; detail: string; cls: string }
const tlEntries = computed<TlEntry[]>(() => {
  if (!timeline.value) return [];
  const t = timeline.value;
  const out: TlEntry[] = [];
  t.reviews.forEach((r: any) => {
    const avg = Math.round((r.composition + r.line_score + r.color + r.observation + r.creativity + r.focus) / 6 * 10) / 10;
    out.push({ d: fmtDate(r.d), kind: '作品点评', label: `《${r.title}》 六维均分 ${avg}`, detail: r.suggestion, cls: '' });
  });
  t.attendance.forEach((a) => {
    const map: Record<string, string> = { absent: '缺勤', leave: '请假', makeup: '补课' };
    out.push({ d: fmtDate(a.d), kind: '出勤', label: `${map[a.status] || a.status}：${a.theme}`, detail: '', cls: a.status === 'absent' ? 'tl-danger' : 'tl-gold' });
  });
  t.events.forEach((e) => {
    out.push({ d: fmtDate(e.d), kind: eventLabel.value(e.type), label: e.title, detail: e.detail, cls: e.type === 'refund_request' ? 'tl-danger' : 'tl-ink' });
  });
  t.communications.forEach((c) => {
    out.push({ d: fmtDate(c.d), kind: '家长沟通', label: `[${c.channel}] 风险${c.risk_level === 'high' ? '高' : c.risk_level === 'medium' ? '中' : '低'}`, detail: c.content, cls: c.risk_level === 'high' ? 'tl-danger' : 'tl-teal' });
  });
  t.evaluations.forEach((e) => {
    out.push({ d: fmtDate(e.d), kind: '升班评估', label: `${e.period}：${decisionLabel.value(e.decision)}`, detail: `评估人：${e.by}`, cls: 'tl-teal' });
  });
  t.renewals.forEach((r) => {
    out.push({ d: fmtDate(r.d), kind: '续费建议（商业）', label: r.package || '续费建议', detail: r.suggestion, cls: 'tl-gold' });
  });
  return out.sort((a, b) => (a.d < b.d ? 1 : -1));
});

const riskLabel = (k: string) => (k === 'high' ? '高' : k === 'medium' ? '中' : '低');
const doPrint = () => window.print();
</script>

<template>
  <div>
    <div v-if="!student" class="loading">加载中...</div>
    <template v-else>
      <div class="flex-between flex-wrap mb">
        <div>
          <h1 style="margin:0">{{ student.name }}</h1>
          <div class="muted small mt">
            {{ student.class_name }} · {{ student.class_stage }} · {{ student.age_group }} · 任课：{{ student.teacher_name }} · 家长：{{ student.parent_name }}
          </div>
        </div>
        <RouterLink to="/supervisor" class="btn btn-ghost btn-sm">← 返回总览</RouterLink>
      </div>

      <div class="flex flex-wrap mb" style="gap:8px;">
        <span class="chip">课时 {{ student.hours_consumed }}/{{ student.hours_purchased }}（剩 {{ student.hours_remaining }}）</span>
        <span class="chip" :class="student.child_willingness === '积极' ? 'chip-ok' : ''">孩子意愿：{{ student.child_willingness }}</span>
        <span v-if="student.willingness_note" class="chip">{{ student.willingness_note }}</span>
      </div>

      <div v-if="error" class="alert alert-danger mb">{{ error }}</div>
      <div v-if="notice" class="alert alert-info mb">{{ notice }}</div>

      <div class="tabs">
        <button class="tab" :class="{ active: tab === 'growth' }" @click="tab = 'growth'">成长轨迹</button>
        <button class="tab" :class="{ active: tab === 'eval' }" @click="tab = 'eval'">升班评估</button>
        <button class="tab" :class="{ active: tab === 'timeline' }" @click="tab = 'timeline'">事件时间线</button>
        <button class="tab" :class="{ active: tab === 'report' }" @click="tab = 'report'">阶段说明</button>
        <button class="tab" :class="{ active: tab === 'biz' }" @click="tab = 'biz'">续费与沟通风险</button>
      </div>

      <!-- 成长轨迹 -->
      <GrowthPanel v-if="tab === 'growth'" :student-id="studentId" />

      <!-- 升班评估 -->
      <div v-if="tab === 'eval' && promo" class="grid" style="grid-template-columns: 1fr 1fr;">
        <div>
          <div class="card">
            <h3>同龄段目标对照（自动汇总）</h3>
            <RadarChart :labels="radarLabels" :series="radarSeries" :size="300" />
            <table class="table mt">
              <thead><tr><th>维度</th><th>阶段均分</th><th>目标</th><th>达成</th></tr></thead>
              <tbody>
                <tr v-for="g in promo.goalComparison" :key="g.dimension">
                  <td>{{ g.label }}</td>
                  <td>{{ g.avg }}</td>
                  <td>{{ g.target }}</td>
                  <td><span class="chip" :class="g.met ? 'chip-ok' : 'chip-gold'">{{ g.met ? '达标' : '发展中' }}</span></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="card">
            <h3>出勤 · 作业 · 课时</h3>
            <div class="grid grid-4">
              <div class="stat"><div class="stat-num">{{ promo.attendance.rate }}%</div><div class="stat-label">出勤率（含补课{{ promo.attendance.makeup }}次）</div></div>
              <div class="stat"><div class="stat-num">{{ promo.homework.rate }}%</div><div class="stat-label">作业完成率（{{ promo.homework.done }}/{{ promo.homework.total }}）</div></div>
              <div class="stat"><div class="stat-num">{{ promo.hours.remaining }}</div><div class="stat-label">剩余课时</div></div>
              <div class="stat"><div class="stat-num">{{ metCount }}/6</div><div class="stat-label">同龄段目标达成</div></div>
            </div>
          </div>
          <div class="card">
            <h3>老师近期点评与家长沟通</h3>
            <div v-for="(r, i) in promo.recentReviews.slice(0, 3)" :key="i" class="small mb">
              <span class="faint">{{ fmtDate(r.d) }} {{ r.teacher_name }}</span>：{{ r.suggestion }}
            </div>
            <div v-if="promo.communications.length" class="mt">
              <div class="small muted mb">近期家长沟通：</div>
              <div v-for="(c, i) in promo.communications.slice(0, 3)" :key="i" class="small mb">
                <span class="chip" :class="c.risk_level === 'high' ? 'chip-danger' : c.risk_level === 'medium' ? 'chip-gold' : 'chip-ok'">风险{{ riskLabel(c.risk_level) }}</span>
                {{ c.content }}
              </div>
            </div>
          </div>
        </div>

        <div>
          <div class="card">
            <h3>填写升班评估</h3>
            <div class="grid grid-2">
              <label class="field"><span>评估阶段</span>
                <input v-model="evalPeriod" class="input" /></label>
              <label class="field"><span>孩子意愿</span>
                <select v-model="evalWill" class="select">
                  <option v-for="w in auth.meta?.willingness || []" :key="w" :value="w">{{ w }}</option>
                </select></label>
            </div>
            <label class="field"><span>家长配合度</span>
              <select v-model="evalCoop" class="select">
                <option v-for="c in auth.meta?.cooperation || []" :key="c" :value="c">{{ c }}</option>
              </select></label>
            <label class="field"><span>任课老师意见摘要</span>
              <textarea v-model="evalSummary" class="textarea"></textarea></label>
            <label class="field"><span>评估结论</span>
              <select v-model="evalDecision" class="select">
                <option v-for="d in auth.meta?.decisions || []" :key="d.key" :value="d.key">{{ d.label }}</option>
              </select></label>
            <label class="field"><span>评估理由（结合上述证据）*</span>
              <textarea v-model="evalRationale" class="textarea" style="min-height:100px"
                placeholder="综合同龄段目标达成、出勤、作业、老师点评、家长配合与孩子意愿说明结论..."></textarea></label>
            <button class="btn btn-accent" :disabled="submitting" @click="submitEval">
              {{ submitting ? '提交中...' : '提交评估结论' }}
            </button>
          </div>
          <div class="card">
            <h3>历史评估（{{ evaluations.length }}）</h3>
            <div v-if="!evaluations.length" class="empty">暂无评估记录</div>
            <div v-for="e in evaluations" :key="e.id" class="mb" style="border-bottom:1px dashed var(--line); padding-bottom:10px;">
              <div class="flex">
                <span class="chip chip-ink">{{ decisionLabel(e.decision) }}</span>
                <b>{{ e.period }}</b>
                <span class="faint small">{{ e.supervisor_name }} · {{ fmtDate(e.created_at) }}</span>
              </div>
              <div class="small muted" style="margin-top:6px">{{ e.rationale }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 事件时间线 -->
      <div v-if="tab === 'timeline'">
        <div class="alert alert-info mb small">
          作品、点评、出勤、沟通、事件与课时消耗关联呈现，避免只凭单次作品判断教学质量。
        </div>
        <div class="grid" style="grid-template-columns: 1fr 340px;">
          <div class="card">
            <h3>关联时间线</h3>
            <div class="timeline">
              <div v-for="(e, i) in tlEntries" :key="i" class="tl-item" :class="e.cls">
                <div class="small faint">{{ e.d }} · {{ e.kind }}</div>
                <div><b>{{ e.label }}</b></div>
                <div v-if="e.detail" class="small muted">{{ e.detail }}</div>
              </div>
            </div>
          </div>
          <div class="card">
            <h3>记录事件</h3>
            <label class="field"><span>类型</span>
              <select v-model="newEvent.type" class="select">
                <option v-for="t in auth.meta?.eventTypes || []" :key="t.key" :value="t.key">{{ t.label }}</option>
              </select></label>
            <label class="field"><span>标题</span>
              <input v-model="newEvent.title" class="input" placeholder="如：请假：9月12日课程" /></label>
            <label class="field"><span>详情</span>
              <textarea v-model="newEvent.detail" class="textarea" style="min-height:70px"></textarea></label>
            <button class="btn btn-teal btn-sm" @click="addEvent">保存事件</button>
          </div>
        </div>
      </div>

      <!-- 阶段说明 -->
      <div v-if="tab === 'report'">
        <div class="card">
          <div class="flex-between flex-wrap">
            <div>
              <h3 style="margin:0">家长会阶段说明</h3>
              <div class="small faint mt">依据课堂点评、出勤与作业记录自动生成，家长会前使用</div>
            </div>
            <div class="flex">
              <input v-model="reportPeriod" class="input" style="width:170px" />
              <button class="btn btn-accent" @click="genReport">生成阶段说明</button>
            </div>
          </div>
        </div>
        <div v-for="r in reports" :key="r.id" class="card">
          <div class="flex-between">
            <div>
              <b>{{ r.period }}</b>
              <span class="faint small" style="margin-left:10px">{{ fmtDateTime(r.created_at) }} · {{ r.generated_by_name }}</span>
            </div>
            <button class="btn btn-ghost btn-sm" @click="activeReport = r">查看</button>
          </div>
        </div>
        <div v-if="!reports.length" class="empty">尚未生成，点击右上角按钮生成</div>
      </div>

      <!-- 续费与沟通风险（商业区） -->
      <div v-if="tab === 'biz'">
        <div class="section-band band-biz mb">
          <span class="band-label">商业续费区 · 与教学证据分开呈现，不作为升班依据</span>
          <div class="band-body">
            <div class="grid" style="grid-template-columns: 1fr 1fr;">
              <div class="card" style="box-shadow:none;">
                <h3>续费建议记录（{{ renewals.length }}）</h3>
                <div v-if="!renewals.length" class="empty">暂无续费建议</div>
                <div v-for="r in renewals" :key="r.id" class="mb" style="border-bottom:1px dashed var(--line); padding-bottom:10px;">
                  <div class="flex">
                    <span class="chip chip-gold">{{ r.package || '续费建议' }}</span>
                    <span class="faint small">{{ r.author_name }} · {{ fmtDateTime(r.created_at) }}</span>
                  </div>
                  <div class="small" style="margin-top:6px">{{ r.suggestion }}</div>
                </div>
                <div style="border-top:1px solid var(--line); padding-top:12px;">
                  <label class="field"><span>新增续费建议</span>
                    <textarea v-model="newRenewal.suggestion" class="textarea" style="min-height:60px"></textarea></label>
                  <div class="flex">
                    <input v-model="newRenewal.package" class="input grow" placeholder="套餐，如：秋季48课时包" />
                    <button class="btn btn-teal" @click="addRenewal">录入</button>
                  </div>
                </div>
              </div>
              <div class="card" style="box-shadow:none;">
                <h3>家长沟通与风险</h3>
                <div v-if="!timeline?.communications.length" class="empty">暂无沟通记录</div>
                <div v-for="(c, i) in timeline?.communications || []" :key="i" class="mb" style="border-bottom:1px dashed var(--line); padding-bottom:10px;">
                  <div class="flex">
                    <span class="chip" :class="c.risk_level === 'high' ? 'chip-danger' : c.risk_level === 'medium' ? 'chip-gold' : 'chip-ok'">风险{{ riskLabel(c.risk_level) }}</span>
                    <span class="chip">{{ c.channel }}</span>
                    <span class="faint small">{{ c.author }} · {{ c.d }}</span>
                  </div>
                  <div class="small" style="margin-top:6px">{{ c.content }}</div>
                </div>
                <div style="border-top:1px solid var(--line); padding-top:12px;">
                  <label class="field"><span>新增沟通记录</span>
                    <textarea v-model="newComm.content" class="textarea" style="min-height:60px"></textarea></label>
                  <div class="flex">
                    <select v-model="newComm.channel" class="select" style="width:100px">
                      <option>微信</option><option>电话</option><option>面谈</option>
                    </select>
                    <select v-model="newComm.risk_level" class="select" style="width:110px">
                      <option value="low">风险低</option><option value="medium">风险中</option><option value="high">风险高</option>
                    </select>
                    <button class="btn btn-teal" @click="addComm">保存</button>
                  </div>
                </div>
              </div>
            </div>
            <div class="alert alert-warn small mt" style="margin:0 6px 6px;">
              课时消耗：已消 {{ student.hours_consumed }} / {{ student.hours_purchased }} 节（剩余 {{ student.hours_remaining }}）。
              若存在退费请求或高沟通风险，请先处理教学与沟通问题，再谈续费。
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- 阶段说明弹窗 -->
    <div v-if="activeReport" class="modal-mask" @click.self="activeReport = null">
      <div class="modal modal-lg">
        <div class="flex-between mb no-print">
          <h3 style="margin:0">{{ activeReport.period }} · 阶段说明</h3>
          <div class="flex">
            <button class="btn btn-ghost btn-sm" @click="doPrint">打印</button>
            <button class="btn btn-ghost btn-sm" @click="activeReport = null">关闭</button>
          </div>
        </div>
        <div class="report-body">{{ activeReport.content }}</div>
      </div>
    </div>
  </div>
</template>
