# Product Requirements Document: 34a Master - IHK Sachkunde

## 1. Executive Summary
The **34a Master** web application is a specialized platform designed to prepare security personnel for the §34a GewO competency examination (IHK Sachkunde). It features a structured learning experience, exam simulations, and a conversion-optimized onboarding flow for traffic from social media (TikTok).

Current product decision: Paywall and Stripe premium access are active product requirements again. This status is not deployed yet and must be verified before release.

---

## 2. Target Audience
- Security trainees and professionals in Germany.
- Users coming from TikTok advertisements looking for a career change.
- Multi-lingual users requiring easy-to-understand explanations of legal and security concepts.

---

## 3. Core Functional Requirements

### 3.1. Lernplan (Learning Plan)
The Lernplan is the central hub for the user's progress.
- **Dashboard**: Displays overall progress, daily goals, and upcoming modules.
- **Module Hierarchy**: Structured learning steps (Introduction, Practice, Mock Exam) for each exam category.
- **Progress Tracking**: Visual indicators (completion percentages, accuracy scores) for each learning unit.
- **Interactive Elements**: Navigation to specific modules and direct access to "Today's Learning".

### 3.2. TikTok Onboarding Flow
A specialized, high-converting onboarding experience designed for users arriving via TikTok.
- **Lead Qualification**: Interactive questionnaire to determine the user's employment status and motivation.
- **Social Proof**: Integration of video testimonials and review marquees.
- **Streamlined Conversion**: Rapid transition from the initial landing component to the core app registration.
- **Personalization**: Adjusts the initial dashboard view based on the onboarding answers.

### 3.3. Paywall & Premium Management
Monetization and access control via Stripe.
- **Premium Indicators**: Visual markers on modules or features that require a subscription.
- **Paywall Dialog**: Triggered when a user tries to access locked content.
- **Subscription Flow**: Secure checkout using Stripe Elements and webhooks.
- **Status Persistence**: Real-time updates to user access rights via Supabase database synchronization.
- **Deployment Status**: Premium access is expected in the product, but the current reactivation still requires deployment verification.

---

## 4. Key User Journeys

### Journey 1: TikTok to Premium User
1. User clicks TikTok ad.
2. User completes TikTok Onboarding questions.
3. User registers an account.
4. User tries to access a premium learning module.
5. **Paywall** triggers, showing benefits.
6. User completes purchase and gains access.

### Journey 2: Daily Learning
1. User logs in.
2. User lands on the **Lernplan**.
3. User selects the active module.
4. User completes a quiz and sees accuracy statistics.
5. Progress is saved and reflected in the Lernplan dashboard.

---

## 5. Technical Stack
- **Frontend**: React, Vite, Tailwind CSS.
- **Backend / DB**: Supabase (PostgreSQL, Auth, Edge Functions).
- **Payments**: Stripe.
- **Analytics**: PostHog, Sentry.

---

## 6. Acceptance Criteria for Tests
- The **Lernplan** must correctly reflect the completion status of modules.
- The **TikTok Onboarding** must capture user data and successfully redirect to the dashboard.
- The **Paywall** must appear for non-premium users when clicking on premium-locked content.
- Stripe checkout and subscription sync must be verified before production release.
- Authentication must persist across page refreshes.
