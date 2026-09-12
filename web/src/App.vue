<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from './stores/auth';

const auth = useAuthStore();
const route = useRoute();

const navItems = computed(() => {
  if (!auth.user) return [];
  if (auth.user.role === 'teacher') {
    return [
      { to: '/teacher', label: '我的班级' },
      { to: '/teacher/questions', label: '家长提问' },
      { to: '/growth', label: '成长轨迹' },
    ];
  }
  if (auth.user.role === 'supervisor') {
    return [
      { to: '/supervisor', label: '教学总览' },
      { to: '/growth', label: '成长轨迹' },
    ];
  }
  return [
    { to: '/parent', label: '孩子的课堂' },
    { to: '/parent/questions', label: '提问与老师回复' },
    { to: '/parent/renewals', label: '续费建议', badge: '商业' },
  ];
});

const roleLabel = computed(() => {
  if (!auth.user) return '';
  return { teacher: '老师', supervisor: '教学主管', parent: '家长' }[auth.user.role];
});

const isLogin = computed(() => route.path === '/login');
</script>

<template>
  <div>
    <header v-if="auth.isLoggedIn && !isLogin" class="topbar">
      <div class="topbar-inner">
        <div class="brand">
          <span class="brand-logo">🎨</span>
          <span class="brand-name">艺芽美术</span>
          <span class="brand-sub">作品点评与升班评估</span>
        </div>
        <nav class="nav">
          <RouterLink v-for="item in navItems" :key="item.to" :to="item.to" class="nav-link"
            :class="{ active: route.path === item.to || (item.to !== '/' && route.path.startsWith(item.to + '/')) }">
            {{ item.label }}
            <span v-if="item.badge" class="nav-badge">{{ item.badge }}</span>
          </RouterLink>
        </nav>
        <div class="userbox">
          <span class="user-role">{{ roleLabel }}</span>
          <span class="user-name">{{ auth.user?.name }}</span>
          <button class="btn btn-ghost btn-sm" @click="auth.logout()">退出</button>
        </div>
      </div>
    </header>
    <main :class="{ 'page': auth.isLoggedIn && !isLogin }">
      <RouterView />
    </main>
  </div>
</template>
