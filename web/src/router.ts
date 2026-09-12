import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from './stores/auth';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: () => import('./views/LoginView.vue'), meta: { public: true } },
    { path: '/', redirect: () => '/' },
    // 老师
    { path: '/teacher', component: () => import('./views/teacher/TeacherHome.vue'), meta: { role: 'teacher' } },
    { path: '/teacher/lesson/:id', component: () => import('./views/teacher/LessonReview.vue'), meta: { role: 'teacher' } },
    { path: '/teacher/questions', component: () => import('./views/teacher/TeacherQuestions.vue'), meta: { role: 'teacher' } },
    // 家长
    { path: '/parent', component: () => import('./views/parent/ParentHome.vue'), meta: { role: 'parent' } },
    { path: '/parent/questions', component: () => import('./views/parent/ParentQuestions.vue'), meta: { role: 'parent' } },
    { path: '/parent/renewals', component: () => import('./views/parent/ParentRenewals.vue'), meta: { role: 'parent' } },
    // 主管
    { path: '/supervisor', component: () => import('./views/supervisor/SupervisorHome.vue'), meta: { role: 'supervisor' } },
    { path: '/supervisor/student/:id', component: () => import('./views/supervisor/SupervisorStudent.vue'), meta: { role: 'supervisor' } },
    // 共享：成长轨迹（老师/主管）
    { path: '/growth', component: () => import('./views/GrowthView.vue'), meta: { role: 'staff' } },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  if (to.meta.public) {
    if (auth.isLoggedIn) return auth.homePath;
    return true;
  }
  if (!auth.isLoggedIn) return '/login';
  await auth.loadMeta();
  const need = to.meta.role as string | undefined;
  if (need === 'staff') {
    if (auth.user!.role === 'parent') return auth.homePath;
  } else if (need && auth.user!.role !== need) {
    return auth.homePath;
  }
  // 根路径按角色跳转
  if (to.path === '/') return auth.homePath;
  return true;
});

export default router;
