import {
  GlobeSimple,
  LinkSimple,
  OpenAiLogo,
  TrendUp,
  TwitterLogo,
} from "@phosphor-icons/react";
import { type CSSProperties, useEffect, useState } from "react";
import {
  SiAnthropic,
  SiClaude,
  SiCloudflare,
  SiDiscord,
  SiFigma,
  SiFontawesome,
  SiGmail,
  SiGithub,
  SiGitee,
  SiGooglecloud,
  SiGoogledrive,
  SiGooglefonts,
  SiGooglesearchconsole,
  SiGoogle,
  SiGodaddy,
  SiJavascript,
  SiMdnwebdocs,
  SiMedium,
  SiNamesilo,
  SiNetlify,
  SiNextdotjs,
  SiNodedotjs,
  SiNotion,
  SiNpm,
  SiOpenai,
  SiPorkbun,
  SiReact,
  SiReddit,
  SiResend,
  SiSemrush,
  SiSimilarweb,
  SiSlack,
  SiStackoverflow,
  SiSupabase,
  SiTailwindcss,
  SiTelegram,
  SiTypescript,
  SiVercel,
  SiVite,
  SiVitepress,
  SiVitest,
  SiVuedotjs,
  SiVueuse,
  SiX,
  SiYoutube,
} from "@icons-pack/react-simple-icons";
import type { BookmarkRecord } from "@/domain/types";
import {
  type FaviconResolution,
  resolveFavicon,
} from "@/services/favicon";

interface BookmarkIconProps {
  bookmark: BookmarkRecord;
  source?: string;
}

export function BookmarkIcon({ bookmark, source }: BookmarkIconProps) {
  const [favicon, setFavicon] = useState<FaviconResolution>();
  const hostname = hostnameFor(bookmark.url);
  const isChatGpt = hostname === "chatgpt.com";
  const isTwitter = hostname === "x.com";
  const brand = brandForHost(hostname);
  const Brand = brand?.Icon;
  const hasStaticIcon = hasStaticBookmarkIcon(bookmark.url);
  const iconStyle =
    favicon?.status === "success"
      ? ({
          "--favicon-display-size": `${favicon.displaySize}px`,
        } as CSSProperties)
      : undefined;

  useEffect(() => {
    if (hasStaticIcon) {
      setFavicon(undefined);
      return;
    }
    let active = true;
    setFavicon(undefined);
    void resolveFavicon(bookmark.url, source).then((resolution) => {
      if (active) setFavicon(resolution);
    });
    return () => {
      active = false;
    };
  }, [bookmark.url, hasStaticIcon, source]);

  return (
    <span
      className={`bookmark-icon${isChatGpt ? " bookmark-icon-chatgpt" : ""}`}
      aria-hidden="true"
      style={iconStyle}
    >
      {isChatGpt ? (
        <OpenAiLogo size={44} color="#ffffff" weight="light" />
      ) : isTwitter ? (
        <TwitterLogo size={43} color="#1D9BF0" weight="fill" />
      ) : hostname === "trends.google.com" ? (
        <TrendUp size={43} color="#4285F4" weight="bold" />
      ) : hostnameMatchesDomain(hostname, "ahrefs.com") ? (
        <LinkSimple size={43} color="#ff8b24" weight="bold" />
      ) : Brand && brand ? (
        <Brand
          size={42}
          color={brand.color}
        />
      ) : favicon?.status === "success" ? (
        <img
          className={`bookmark-favicon bookmark-favicon-${favicon.quality}`}
          src={favicon.url}
          alt=""
          draggable={false}
          decoding="async"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFavicon({ status: "failed" })}
        />
      ) : (
        <GlobeSimple size={35} weight="duotone" />
      )}
      <span className="bookmark-icon-gloss" />
    </span>
  );
}

const BRANDS = [
  { hosts: ["mail.google.com"], Icon: SiGmail, color: "#EA4335" },
  { hosts: ["drive.google.com"], Icon: SiGoogledrive, color: "#1FA463" },
  { hosts: ["fonts.google.com"], Icon: SiGooglefonts, color: "#4285F4" },
  {
    hosts: ["search.google.com"],
    Icon: SiGooglesearchconsole,
    color: "#458CF5",
  },
  { hosts: ["cloud.google.com"], Icon: SiGooglecloud, color: "#4285F4" },
  { hosts: ["google.com"], Icon: SiGoogle, color: "#4285F4" },
  { hosts: ["withgoogle.com"], Icon: SiGoogle, color: "#4285F4" },
  { hosts: ["github.com"], Icon: SiGithub, color: "#181717" },
  { hosts: ["gitee.com"], Icon: SiGitee, color: "#C71D23" },
  { hosts: ["similarweb.com"], Icon: SiSimilarweb, color: "#ff6b35" },
  { hosts: ["godaddy.com"], Icon: SiGodaddy, color: "#09757a" },
  { hosts: ["namesilo.com"], Icon: SiNamesilo, color: "#123c69" },
  { hosts: ["cloudflare.com"], Icon: SiCloudflare, color: "#f38020" },
  { hosts: ["supabase.com"], Icon: SiSupabase, color: "#3ecf8e" },
  { hosts: ["resend.com"], Icon: SiResend, color: "#111111" },
  { hosts: ["notion.so", "notion.site"], Icon: SiNotion, color: "#111111" },
  { hosts: ["figma.com"], Icon: SiFigma, color: "#a259ff" },
  { hosts: ["slack.com"], Icon: SiSlack, color: "#4a154b" },
  { hosts: ["youtube.com", "youtu.be"], Icon: SiYoutube, color: "#ff0000" },
  { hosts: ["semrush.com"], Icon: SiSemrush, color: "#ff642d" },
  { hosts: ["porkbun.com"], Icon: SiPorkbun, color: "#ef7878" },
  { hosts: ["vercel.com"], Icon: SiVercel, color: "#111111" },
  { hosts: ["netlify.com"], Icon: SiNetlify, color: "#00c7b7" },
  { hosts: ["fontawesome.com"], Icon: SiFontawesome, color: "#538DD7" },
  { hosts: ["tailwindcss.com"], Icon: SiTailwindcss, color: "#06B6D4" },
  { hosts: ["developer.mozilla.org"], Icon: SiMdnwebdocs, color: "#111111" },
  { hosts: ["vuejs.org"], Icon: SiVuedotjs, color: "#42B883" },
  { hosts: ["vite.dev", "vitejs.dev"], Icon: SiVite, color: "#646CFF" },
  { hosts: ["vitepress.dev"], Icon: SiVitepress, color: "#5C73E7" },
  { hosts: ["vitest.dev"], Icon: SiVitest, color: "#6E9F18" },
  { hosts: ["vueuse.org"], Icon: SiVueuse, color: "#41B883" },
  { hosts: ["react.dev"], Icon: SiReact, color: "#149ECA" },
  { hosts: ["nodejs.org"], Icon: SiNodedotjs, color: "#5FA04E" },
  { hosts: ["typescriptlang.org"], Icon: SiTypescript, color: "#3178C6" },
  { hosts: ["javascript.com"], Icon: SiJavascript, color: "#E6C700" },
  { hosts: ["npmjs.com"], Icon: SiNpm, color: "#CB3837" },
  { hosts: ["nextjs.org"], Icon: SiNextdotjs, color: "#111111" },
  { hosts: ["openai.com"], Icon: SiOpenai, color: "#111111" },
  { hosts: ["anthropic.com"], Icon: SiAnthropic, color: "#191919" },
  { hosts: ["claude.ai"], Icon: SiClaude, color: "#D97757" },
  { hosts: ["reddit.com"], Icon: SiReddit, color: "#FF4500" },
  { hosts: ["x.com"], Icon: SiX, color: "#111111" },
  { hosts: ["discord.com"], Icon: SiDiscord, color: "#5865F2" },
  { hosts: ["telegram.org"], Icon: SiTelegram, color: "#26A5E4" },
  { hosts: ["stackoverflow.com"], Icon: SiStackoverflow, color: "#F58025" },
  { hosts: ["medium.com"], Icon: SiMedium, color: "#111111" },
] as const;

function brandForHost(hostname: string) {
  return BRANDS.find(({ hosts }) =>
    hosts.some(
      (host) => hostname === host || hostname.endsWith(`.${host}`),
    ),
  );
}

export function hasStaticBookmarkIcon(url: string): boolean {
  const hostname = hostnameFor(url);
  return (
    hostname === "chatgpt.com" ||
    hostname === "x.com" ||
    hostname === "trends.google.com" ||
    hostnameMatchesDomain(hostname, "ahrefs.com") ||
    Boolean(brandForHost(hostname))
  );
}

function hostnameMatchesDomain(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function hostnameFor(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}
