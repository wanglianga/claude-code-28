<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api, fmtDate } from '../../api';

interface ClassInfo {
  id: number; name: string; stage: string; age_group: string;
  teacher_name: string; student_count: number; lesson_count: number;
}
interface ClassDetail extends ClassInfo {
  students: Array<{ id: number; name: string; review_count: number; hours_consumed: number; hours_purchased: number }>;
  lessons: Array<{ id: number; lesson_date: string; theme: string; stage: string; seq: number; review_count: number; prep_focus: string }>;
}

const classes = ref<ClassInfo[]>([]);
const detail = ref<ClassDetail | null>(null);
const pendingCount = ref(0);
const loading = ref(true);

async function loadClasses() {
  try {
    classes.value = await api('/api/classes');
    if (classes.value.length) await selectClass(classes.value[0].id);
    const qs = await api<any[]>('/api/questions');
    pendingCount.value = qs.filter((q) => q.status === 'pending').length;
  } catch {
    /* 页面快速切换导致请求中断时忽略，避免未捕获异常 */
  } finally {
    loading.value = false;
  }
}

async function selectClass(id: number) {
  try {
    detail.value = await api(`/api/classes/${id}`);
  } catch {
    /* 请求中断可忽略 */
  }
}

onMounted(loadClasses);
</script>

<template>
  <div>
    <div class="flex-between mb">
      <h1 style="margin:0">我的班级</h1>
      <RouterLink to="/teacher/questions" class="btn btn-ghost btn-sm">
        家长提问 <span v-if="pendingCount" class="chip chip-accent">{{ pendingCount }}条待回复</span>
      </RouterLink>
    </div>
    <div v-if="loading" class="loading">加载中...</div>
    <template v-else>
      <div class="tabs">
        <button v-for="c in classes" :key="c.id" class="tab" :class="{ active: detail?.id === c.id }"
          @click="selectClass(c.id)">
          {{ c.name }} · {{ c.age_group }}
        </button>
      </div>
      <div v-if="detail" class="grid" style="grid-template-columns: 1fr 1.2fr;">
        <div class="card">
          <h3>学生（{{ detail.students.length }}）</h3>
          <table class="table">
            <thead>
              <tr><th>姓名</th><th>已点评</th><th>课时消耗</th><th></th></tr>
            </thead>
            <tbody>
              <tr v-for="s in detail.students" :key="s.id">
                <td><b>{{ s.name }}</b></td>
                <td>{{ s.review_count }} 次</td>
                <td>{{ s.hours_consumed }} / {{ s.hours_purchased }}</td>
                <td>
                  <RouterLink :to="`/growth?student=${s.id}`" class="btn btn-ghost btn-sm">成长轨迹</RouterLink>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="card">
          <h3>课程与课后点评</h3>
          <table class="table">
            <thead>
              <tr><th>日期</th><th>主题</th><th>阶段目标</th><th>点评进度</th><th></th></tr>
            </thead>
            <tbody>
              <tr v-for="l in detail.lessons" :key="l.id">
                <td class="muted">{{ fmtDate(l.lesson_date) }}</td>
                <td>
                  {{ l.theme }}
                  <div v-if="l.prep_focus" class="small" style="color:var(--warn)">🎯 {{ l.prep_focus }}</div>
                </td>
                <td><span class="chip chip-teal">{{ l.stage }}</span></td>
                <td>
                  <span class="chip" :class="l.review_count >= detail.students.length ? 'chip-ok' : 'chip-gold'">
                    {{ l.review_count }}/{{ detail.students.length }}
                  </span>
                </td>
                <td>
                  <RouterLink :to="`/teacher/lesson/${l.id}`" class="btn btn-sm"
                    :class="l.review_count >= detail.students.length ? 'btn-ghost' : 'btn-accent'">
                    {{ l.review_count >= detail.students.length ? '查看' : '去点评' }}
                  </RouterLink>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>
