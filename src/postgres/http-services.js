'use strict';

const { currentPostgresIdentity, assertOwnIdentity } = require('./http-context');
const { workshopCalendar } = require('../utils/workshop-calendar');

const identity = () => currentPostgresIdentity();
const own = (value) => assertOwnIdentity(value);
const unsupported = (message) => { throw Object.assign(new Error(message), { status: 501 }); };

function createPostgresHttpServices({ repositories: r, accountDeletion = null }) {
  if (!r) throw new TypeError('PostgreSQL repositories are required.');
  const learning = {
    listCourses: user => r.learning.listCourses(own(user)), courseDetail: (user,id) => r.learning.courseDetail(own(user),id),
    enroll: (user,id) => r.learning.enroll(own(user),id), completeLesson: (_ctx,id) => r.learning.completeLesson(identity(),id),
    listCertificates: user => r.learning.listCertificates(own(user)), verifyCertificate: code => r.learning.verifyCertificate(code),
  };
  const workshops = {
    list:user=>r.workshops.list(own(user)), register:(_ctx,id)=>r.workshops.register(identity(),id), cancel:(user,id)=>r.workshops.cancel(own(user),id),
    async calendar(id){const x=await r.workshops.detail(identity(),id);return workshopCalendar(x.workshop);},
    create:(_ctx,f)=>r.adminWorkshops.create(identity(),f), adminList:()=>r.adminWorkshops.list(identity()),
    registrations:(id,status,search)=>r.adminWorkshops.registrations(identity(),id,{status,search}),
    attendance:(_ctx,w,registration,status)=>r.adminWorkshops.attendance(identity(),w,registration,status), delete:(_ctx,id)=>r.adminWorkshops.remove(identity(),id),
  };
  const messaging = {
    directory:(user,f)=>r.discovery.directory(own(user),{...f,q:String(f.like||'').replaceAll('%','')}), educator:(user,id)=>r.discovery.educator(own(user),id),
    requestConnection:(_ctx,id)=>r.connections.request(identity(),id), respondToConnection:(_ctx,id,a)=>r.connections.respond(identity(),id,a),
    removeConnection:(_ctx,id)=>r.connections.remove(identity(),id), connections:user=>r.connections.lists(own(user)),
    listConversations:user=>r.messaging.conversations(own(user)), getConversation:(_ctx,id)=>r.messaging.conversation(identity(),id),
    sendMessage:(_ctx,id,body)=>r.messaging.send(identity(),id,body),
  };
  const community = {
    communities:()=>r.community.communities(identity()), discussions:f=>r.community.discussions(identity(),f), communityPosts:id=>r.community.communityPosts(identity(),id),
    postDetail:id=>r.community.detail(identity(),id), createPost:(_ctx,id,t,b)=>r.community.createPost(identity(),id,t,b), reply:(_ctx,id,b)=>r.community.reply(identity(),id,b),
    deleteReply:(_ctx,id)=>r.community.deleteReply(identity(),id), deletePost:(_ctx,id)=>r.community.deletePost(identity(),id),
  };
  const notifications = {
    preview:user=>r.notifications.preview(own(user)), list:(user,s,c,p)=>r.notifications.list(own(user),s,c,p),
    markOne:(user,id)=>r.notifications.markOne(own(user),id), markAll:user=>r.notifications.markAll(own(user)),
  };
  const mentorship = { mentors:user=>r.mentorship.mentors(own(user)), list:user=>r.mentorship.list(own(user)), request:(_c,id,t,m)=>r.mentorship.request(identity(),id,t,m), respond:(_c,id,a)=>r.mentorship.respond(identity(),id,a) };
  const support = { list:user=>r.support.list(own(user)), create:(_c,k,s,b)=>r.support.create(identity(),k,s,b), detail:(_c,id)=>r.support.detail(identity(),id), reply:(_c,id,b)=>r.support.reply(identity(),id,b), adminUpdate:(_c,id,s,p)=>r.support.adminUpdate(identity(),id,s,p) };
  const tutorials = { list:user=>r.tutorials.list(own(user)), detail:(user,id)=>r.tutorials.detail(own(user),id), toggle:(user,id)=>r.tutorials.toggle(own(user),id) };
  const lessonPlans = { overview:user=>r.lessonPlans.overview(own(user)), list:(user,f)=>r.lessonPlans.list(own(user),f), detail:(user,id)=>r.lessonPlans.detail(own(user),id), create:(user,f)=>r.lessonPlans.create(own(user),f), update:(user,id,f)=>r.lessonPlans.update(own(user),id,f), delete:(user,id)=>r.lessonPlans.remove(own(user),id), duplicate:(user,id)=>r.lessonPlans.duplicate(own(user),id) };
  const careers = {
    async overview(user){const i=own(user),[profile,applications]=await Promise.all([r.career.getOwn(i),r.jobs.applications(i)]);return{profile,applications};},
    profile:user=>r.career.getOwn(own(user)), saveProfile:(_c,f)=>r.career.saveOwn(identity(),f),
    async summary(user){const p=await r.career.getOwn(own(user));return{suggestion:p?.professional_summary||''};},
    jobs:(user,f)=>r.jobs.list(own(user),f), detail:(user,id)=>r.jobs.detail(own(user),id), apply:(_c,id)=>r.jobs.apply(identity(),id), applications:user=>r.jobs.applications(own(user)),
  };
  const profiles = {
    update:(_c,f)=>r.user.updateOwnProfile(identity(),f),
    async export(){const i=identity(),[profile,career,preferences]=await Promise.all([r.user.getOwn(i),r.career.getOwn(i),r.preferences.getOwn(i)]);return{profile,career,preferences};},
    deleteAccount:(ctx,password)=>accountDeletion?accountDeletion.deleteOwn(ctx,password):unsupported('PostgreSQL account deletion requires an explicitly configured Supabase Auth administrator dependency.'),
  };
  const settings = {
    async overview(user){const i=own(user.id),[profile,preferences]=await Promise.all([r.user.getOwn(i),r.preferences.getOwn(i)]);return{profile,notifications:preferences};},
    updateNotifications:(_c,f)=>r.preferences.saveOwn(identity(),f),
  };
  const admin = {
    async overview(){const i=identity(),[users,community]=await Promise.all([r.adminUsers.statistics(i),r.adminCommunity.statistics(i)]);return{users,community};},
    analytics:period=>r.adminReporting.analytics(identity(),period), users:f=>r.adminUsers.list(identity(),f), userDetail:id=>r.adminUsers.detail(identity(),id),
    updateUser:(_c,id,role,status)=>r.adminUsers.updateAccount(identity(),id,{...(role&&{role}),...(status&&{status})}),
    courses:()=>r.adminLearning.listCourses(identity()), course:id=>r.adminLearning.courseDetail(identity(),id), createCourse:(_c,f,l)=>r.adminLearning.createCourse(identity(),f,l),
    updateCourse:(_c,id,f)=>r.adminLearning.updateCourse(identity(),id,f), replaceCurriculum:(_c,id,l)=>r.adminLearning.replaceCurriculum(identity(),id,l), setCourseStatus:(_c,id,s)=>r.adminLearning.setCourseStatus(identity(),id,s),
    jobs:()=>r.adminJobs.list(identity()), createJob:(_c,f)=>r.adminJobs.create(identity(),f), closeJob:(_c,id)=>r.adminJobs.close(identity(),id), discussions:()=>r.adminCommunity.discussions(identity()),
    mentorships:()=>r.adminReporting.mentorships(identity()), auditLog:(q,page)=>r.adminReporting.auditLog(identity(),q,page), recentAudit:()=>r.adminReporting.recentAudit(identity()),
    tickets:(s,q)=>r.support.adminList(identity(),s,q),
  };
  return Object.freeze({learning,workshops,messaging,community,notifications,mentorship,support,tutorials,lessonPlans,careers,profiles,settings,dashboard:{overview:user=>r.dashboard.overview(own(user))},admin});
}

module.exports = { createPostgresHttpServices };
