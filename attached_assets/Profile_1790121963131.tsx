import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { MapPin, Settings, Loader2, Calendar, Trophy, ThumbsUp, Star, Users, Bot, Medal } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { useGetUserProfile, useGetCurrentUser, useToggleUpvote } from "@workspace/api-client-react";
import { getAuthHeaders, isAuthenticated } from "@/lib/auth";
import { participationLabel, userCanHost } from "@/lib/userRole";
import { useQueryClient } from "@tanstack/react-query";

function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(" ");
}

const LEVEL_LABELS: Record<number, string> = {
  1: "Explorer",
  2: "Contributor",
  3: "Champion",
  4: "Leader",
  5: "Legend",
};

function getLevelLabel(level: number): string {
  if (level >= 5) return LEVEL_LABELS[5];
  return LEVEL_LABELS[level] || "Explorer";
}

export default function Profile() {
  const [, params] = useRoute("/u/:username");
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const isMe = params?.username === "me";
  const username = params?.username || "";

  const meQuery = { enabled: isMe && isAuthenticated() };
  const meResult = useGetCurrentUser({
    query: meQuery as typeof meQuery & { queryKey: readonly unknown[] },
    request: { headers: getAuthHeaders() },
  });

  const resolvedUsername = isMe ? (meResult.data?.username || "_") : username;
  const profileQuery = { enabled: isMe ? !!meResult.data?.username : !!username, retry: false as const };
  const profileResult = useGetUserProfile(resolvedUsername, {
    query: profileQuery as typeof profileQuery & { queryKey: readonly unknown[] },
    request: { headers: getAuthHeaders() },
  });

  const upvoteMutation = useToggleUpvote({
    request: { headers: getAuthHeaders() },
  });

  const [aiInsight, setAiInsight] = useState<string | null>(null);

  const profile = profileResult.data;
  const isLoading = isMe ? (meResult.isLoading || (meResult.data && profileResult.isLoading)) : profileResult.isLoading;
  const error = isMe ? (meResult.error || profileResult.error) : profileResult.error;

  useEffect(() => {
    if (!isMe || !isAuthenticated()) return;
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    fetch(`${base}/api/ai/insights`, { headers: getAuthHeaders() })
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(d => { if (d.summary) setAiInsight(d.summary); })
      .catch(() => {});
  }, [isMe]);

  const handleUpvote = () => {
    if (!profile) return;
    upvoteMutation.mutate(
      { username: profile.username },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: [`/api/users/${profile.username}`] });
          queryClient.invalidateQueries({ queryKey: ["/api/users/me"] });
        },
      }
    );
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!profile || error) {
    return (
      <Layout>
        <div className="min-h-screen flex flex-col items-center justify-center px-4">
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            {isMe ? "Not logged in" : "User not found"}
          </h2>
          <p className="text-gray-500 mb-6">
            {isMe ? "Complete onboarding to create your profile." : `No user found with username @${username}.`}
          </p>
          <Button onClick={() => setLocation("/")} className="rounded-xl bg-primary hover:bg-primary/90">
            {isMe ? "Get Started" : "Go Home"}
          </Button>
        </div>
      </Layout>
    );
  }

  const level = Math.max(1, Math.floor(profile.xp / 500) + 1);
  const xpInCurrentLevel = profile.xp % 500;
  const progressPercent = (xpInCurrentLevel / 500) * 100;
  const initials = profile.name.split(" ").map((n: string) => n[0]).join("").substring(0, 2).toUpperCase();

  const allExperiences = [
    ...(profile?.personal_experiences || []),
    ...(profile?.professional_experiences || []),
  ];
  const hostedExperiences = allExperiences.filter(e => e.role === "hosted");
  const joinedExperiences = allExperiences.filter(e => e.role === "joined");

  return (
    <Layout>
      <div className="min-h-screen bg-gray-50 pb-24">
        <div className="h-48 bg-gradient-to-r from-primary via-pink-500 to-rose-500 relative">
          <div className="absolute inset-0 bg-black/10" />
        </div>

        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 relative -mt-20">
          <div className="bg-white rounded-3xl shadow-lg p-6 sm:p-8 mb-6 border border-gray-100">
            <div className="flex flex-col sm:flex-row gap-6 items-center sm:items-start text-center sm:text-left">
              <div className="w-32 h-32 rounded-full border-4 border-white bg-primary text-white flex items-center justify-center text-4xl font-display font-bold shadow-md shrink-0">
                {initials}
              </div>

              <div className="flex-1 w-full">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
                  <div>
                    <h1 className="text-3xl font-bold text-gray-900">{profile.name}</h1>
                    <p className="text-primary font-medium text-lg">@{profile.username}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap justify-center sm:justify-start">
                      <span className="text-sm font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/15">
                        {getLevelLabel(level)}
                      </span>
                      <span
                        className={`text-xs font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${
                          userCanHost(profile)
                            ? "bg-amber-50 text-amber-800 border-amber-200"
                            : "bg-slate-50 text-slate-600 border-slate-200"
                        }`}
                      >
                        {participationLabel(profile.role)}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-3 text-sm text-gray-500 justify-center sm:justify-start">
                      <span className="flex items-center bg-gray-100 px-3 py-1 rounded-full text-gray-700 font-medium">
                        <MapPin className="w-4 h-4 mr-1.5" />
                        {profile.city}
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {isMe && (
                      <Button
                        variant="outline"
                        onClick={() => setLocation("/onboarding")}
                        className="rounded-xl border-gray-200 text-gray-700 hover:bg-gray-50"
                      >
                        <Settings className="w-4 h-4 mr-2" />
                        Edit Profile
                      </Button>
                    )}
                    {!isMe && isAuthenticated() && (
                      <Button
                        variant={profile?.has_upvoted ? "default" : "outline"}
                        onClick={handleUpvote}
                        disabled={upvoteMutation.isPending}
                        className={cn(
                          "rounded-xl",
                          profile?.has_upvoted
                            ? "bg-primary hover:bg-primary/90"
                            : "border-gray-200 text-gray-700 hover:bg-gray-50"
                        )}
                      >
                        <ThumbsUp className="w-4 h-4 mr-2" />
                        {profile?.has_upvoted ? "Upvoted" : "Upvote"}
                      </Button>
                    )}
                  </div>
                </div>

                {profile.bio && (
                  <p className="mt-5 text-gray-600 leading-relaxed max-w-xl">{profile.bio}</p>
                )}

                <div className="mt-8 bg-gray-50 rounded-2xl p-5 border border-gray-100 flex flex-col sm:flex-row gap-6">
                  <div className="flex-1">
                    <div className="flex justify-between items-end mb-2">
                      <div>
                        <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Current Level</span>
                        <div className="flex items-center gap-2">
                          <span className="text-2xl font-bold text-gray-900">Level {level}</span>
                        </div>
                      </div>
                      <span className="text-sm font-medium text-primary">{profile.xp} XP total</span>
                    </div>
                    <div className="h-3 w-full bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-primary to-rose-400 rounded-full transition-all duration-1000 ease-out"
                        style={{ width: `${Math.max(5, progressPercent)}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-400 mt-2 text-right">{500 - xpInCurrentLevel} XP to next level</p>
                  </div>

                  <div className="w-px bg-gray-200 hidden sm:block" />

                  <div className="flex gap-6 sm:justify-end justify-center pt-4 sm:pt-0 border-t sm:border-t-0 border-gray-200">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-gray-900 flex items-center justify-center gap-1">
                        {profile.upvote_count} <span className="text-primary text-xl">&#8593;</span>
                      </div>
                      <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Upvotes</span>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-gray-900">{profile.interests.length}</div>
                      <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Interests</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {isMe && aiInsight && (
            <div className="bg-gradient-to-br from-primary/5 via-rose-50 to-white rounded-2xl p-5 mb-6 border border-primary/10">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
                <h3 className="text-sm font-bold text-gray-900">AI Insights</h3>
              </div>
              <p className="text-sm text-gray-600 leading-relaxed">{aiInsight}</p>
            </div>
          )}

          <div className="space-y-6">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Star className="w-4 h-4 text-primary" />
                </div>
                <h2 className="text-lg font-display font-bold text-gray-900">Experiences Hosted</h2>
                <span className="text-sm text-gray-400 font-medium ml-auto">{hostedExperiences.length}</span>
              </div>

              {hostedExperiences.length === 0 ? (
                <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm text-center">
                  <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Star className="w-6 h-6 text-gray-300" />
                  </div>
                  <h3 className="font-bold text-gray-900 mb-1">No hosted experiences yet</h3>
                  <p className="text-sm text-gray-500 mb-4">
                    {isMe
                      ? userCanHost(profile)
                        ? "Create your first experience and earn XP!"
                        : "You chose to join only. Enable hosting in Edit profile to create experiences."
                      : "This user hasn't hosted any experiences yet."}
                  </p>
                  {isMe && userCanHost(profile) && (
                    <Button
                      onClick={() => setLocation("/create")}
                      size="sm"
                      className="rounded-xl bg-primary hover:bg-primary/90"
                    >
                      Create Experience
                    </Button>
                  )}
                  {isMe && !userCanHost(profile) && (
                    <Button
                      variant="outline"
                      onClick={() => setLocation("/onboarding")}
                      size="sm"
                      className="rounded-xl"
                    >
                      Become a host
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {hostedExperiences.map((exp) => (
                    <button
                      key={`hosted-${exp.id}`}
                      onClick={() => setLocation(`/experience/${exp.id}`)}
                      className="w-full text-left bg-white rounded-2xl p-4 border border-gray-100 shadow-sm hover:shadow-md hover:border-primary/20 transition-all"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="font-bold text-gray-900">{exp.title}</h3>
                        <span
                          className={cn(
                            "text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ml-2",
                            exp.type === "personal"
                              ? "bg-primary/5 text-primary/70 border border-primary/15"
                              : "bg-primary/10 text-primary border border-primary/20"
                          )}
                        >
                          {exp.type === "personal" ? "Personal" : "Professional"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-500 flex-wrap">
                        <span className="capitalize bg-gray-50 px-2 py-0.5 rounded text-gray-600 font-medium">
                          {exp.category}
                        </span>
                        <span className="bg-gray-50 px-2 py-0.5 rounded text-gray-600 font-medium">{exp.date}</span>
                        <span className="bg-gray-50 px-2 py-0.5 rounded text-gray-600 font-medium flex items-center gap-1">
                          <MapPin className="w-3 h-3" /> {exp.city}
                        </span>
                        {exp.status === "completed" && (
                          <span className="font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded text-xs">Completed</span>
                        )}
                        {exp.status !== "completed" && (
                          <span className="font-semibold text-primary/70 bg-primary/5 px-2 py-0.5 rounded text-xs">Active</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-gray-200" />

            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Users className="w-4 h-4 text-primary" />
                </div>
                <h2 className="text-lg font-display font-bold text-gray-900">Experiences Joined</h2>
                <span className="text-sm text-gray-400 font-medium ml-auto">{joinedExperiences.length}</span>
              </div>

              {joinedExperiences.length === 0 ? (
                <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm text-center">
                  <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Calendar className="w-6 h-6 text-gray-300" />
                  </div>
                  <h3 className="font-bold text-gray-900 mb-1">No joined experiences yet</h3>
                  <p className="text-sm text-gray-500 mb-4">
                    {isMe ? "Discover and join experiences to start earning XP." : "This user hasn't joined any experiences yet."}
                  </p>
                  {isMe && (
                    <Button
                      onClick={() => setLocation("/home")}
                      size="sm"
                      className="rounded-xl bg-primary hover:bg-primary/90"
                    >
                      Explore Experiences
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {joinedExperiences.map((exp) => (
                    <button
                      key={`joined-${exp.id}`}
                      onClick={() => setLocation(`/experience/${exp.id}`)}
                      className="w-full text-left bg-white rounded-2xl p-4 border border-gray-100 shadow-sm hover:shadow-md hover:border-primary/20 transition-all"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="font-bold text-gray-900">{exp.title}</h3>
                        <span
                          className={cn(
                            "text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ml-2",
                            exp.type === "personal"
                              ? "bg-primary/5 text-primary/70 border border-primary/15"
                              : "bg-primary/10 text-primary border border-primary/20"
                          )}
                        >
                          {exp.type === "personal" ? "Personal" : "Professional"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-500 flex-wrap">
                        <span className="capitalize bg-gray-50 px-2 py-0.5 rounded text-gray-600 font-medium">
                          {exp.category}
                        </span>
                        <span className="bg-gray-50 px-2 py-0.5 rounded text-gray-600 font-medium">{exp.date}</span>
                        <span className="bg-gray-50 px-2 py-0.5 rounded text-gray-600 font-medium flex items-center gap-1">
                          <MapPin className="w-3 h-3" /> {exp.city}
                        </span>
                        {exp.status === "completed" && exp.xp_earned > 0 && (
                          <span className="font-bold text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/15 flex items-center gap-1">
                            <Trophy className="w-3 h-3" /> +{exp.xp_earned} XP
                          </span>
                        )}
                        {exp.status === "joined" && (
                          <span className="font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded text-xs">In progress</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-gray-200" />

            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                  <Trophy className="w-4 h-4 text-amber-600" />
                </div>
                <h2 className="text-lg font-display font-bold text-gray-900">Awards</h2>
              </div>

              <div className="bg-gradient-to-br from-amber-50 via-yellow-50 to-white rounded-2xl p-5 border border-amber-100 shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-amber-100 rounded-2xl flex items-center justify-center shrink-0">
                    <Medal className="w-7 h-7 text-amber-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 text-base">Waitlist Pioneer</h3>
                    <p className="text-sm text-gray-500 mt-0.5">
                      Joined {profile.created_at
                        ? new Date(profile.created_at).toLocaleDateString("en-US", {
                            month: "long",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "the waitlist"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
