const arrow = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" class="size-12" aria-hidden="true"><path d="M5 8H11M11 8L7.14286 12M11 8L9.07143 6L7.14286 4" stroke="currentColor"></path></svg>`;

function primaryLink(label: string, href: string) {
  return `<a class="button-v2 button-base-v2 group w-fit" href="${href}">
    <span class="lg-v2:group-hover:pr-12 lg-v2:group-active:pr-12 transition-all duration-150 ease-in-out pr-6">${label}</span>
    <span class="lg-v2:border-l lg-v2:group-hover:pl-6 lg-v2:group-active:pl-6 flex items-center border-transparent transition-all duration-150 ease-in-out py-7.5 pr-6">${arrow}</span>
  </a>`;
}

// Retain the reference's type scale, responsive spacing, and animation hooks.
// Each phrase occupies the same reserved line so rotating copy cannot move the CTA.
export const snitchHeroMarkup = `
<div class="md-v2:min-h-[calc(100svh-12.3rem)] lg-v2:min-h-[calc(100svh-14.1rem)] flex flex-col">
  <section id="home-hero" class="max-md-v2:min-h-[calc(100svh-8rem)] max-md-v2:pt-24 md-v2:pt-32 lg-v2:pt-40 relative flex w-full flex-1 flex-col overflow-hidden">
    <div class="pointer-events-none absolute inset-0 overflow-hidden" style="background:linear-gradient(180deg, #E34850 0%, #7048D8 100%)">
      <div class="absolute inset-0">
        <canvas class="size-full rounded-[inherit] object-cover absolute inset-0" aria-hidden="true"></canvas>
        <canvas style="display:none" aria-hidden="true"></canvas>
      </div>
    </div>
    <div class="md-v2:px-16 lg-v2:px-32 max-md-v2:py-12 pointer-events-none relative z-10 mx-auto flex w-full max-w-864 flex-1 flex-col justify-center px-8">
      <div class="rounded-xl-v2 md-v2:p-32 lg-v2:p-48 lg-v2:pb-64 overflow-x-hidden will-change-transform">
        <div class="flex flex-col items-center text-center">
          <h1 class="h2-serif-v2 md-v2:mt-24 mt-16 text-center text-white" aria-label="The operating layer for onchain payments">
            <span class="flex flex-col items-center">
              <span class="flex flex-wrap justify-center gap-x-[0.3em]">
                <span class="whitespace-nowrap">The operating</span><span class="whitespace-nowrap">layer for</span>
              </span>
              <span class="md-v2:whitespace-nowrap relative mt-0 inline-block max-w-full">
                <span aria-hidden="true" class="max-md-v2:hidden invisible block select-none">onchain payments</span>
                <span aria-hidden="true" class="md-v2:hidden invisible grid select-none *:col-start-1 *:row-start-1"><span class="whitespace-nowrap">onchain payments</span></span>
                <span class="absolute inset-0 flex items-center justify-center">
                  <span class="HeroRotatingHeadline-module__wv_VSW__phrase">
                    <span class="md-v2:hidden text-center">onchain payments</span><span class="max-md-v2:hidden whitespace-nowrap">onchain payments</span>
                  </span>
                </span>
              </span>
            </span>
          </h1>
          <p class="h4-sans-serif-v2 md-v2:mt-16 mt-8 max-w-300 text-white">Stablecoin operations, built around your team.</p>
          <div class="darkMode md-v2:mt-12 md-v2:mb-32 pointer-events-auto mt-10 flex flex-col items-center">
            ${primaryLink('Explore Snitch', '#platform')}
            <a href="/?demo=1" class="body-2-v2 text-text-primary mt-8 border-0 bg-transparent p-0 underline decoration-current/50 underline-offset-2 transition-[text-decoration-color] hover:decoration-current">View workspace</a>
          </div>
        </div>
      </div>
    </div>
    <div class="relative z-10 mt-auto w-full shrink-0" aria-label="Workspace capabilities">
      <div class="relative -top-px">
        <div class="pointer-events-none absolute inset-x-0 -inset-y-0.5 border border-white/20"></div>
        <ul class="md-v2:px-16 lg-v2:px-32 xl-v2:px-40 mx-auto grid max-w-864 grid-cols-2 gap-0.5 px-8 outline md-v2:grid-cols-3 outline-white/20" style="list-style:none">
          <li class="outline flex min-w-0 flex-1 items-center justify-center px-12 py-8 md-v2:px-12 lg-v2:py-12 bg-white/20 outline-white/20 text-white"><span class="label-v2 uppercase text-center">Shared wallets</span></li>
          <li class="outline flex min-w-0 flex-1 items-center justify-center px-12 py-8 md-v2:px-12 lg-v2:py-12 bg-white/20 outline-white/20 text-white"><span class="label-v2 uppercase text-center">Role-based access</span></li>
          <li class="outline flex min-w-0 flex-1 items-center justify-center px-12 py-8 md-v2:px-12 lg-v2:py-12 bg-white/20 outline-white/20 text-white col-span-2 md-v2:col-span-1"><span class="label-v2 uppercase text-center">Stablecoin operations</span></li>
        </ul>
      </div>
    </div>
  </section>
</div>`;

export const snitchCtaMarkup = `
<section id="home-get-started" aria-label="Explore Snitch" class="snitch-closing-cta relative w-full overflow-hidden">
  <canvas class="size-full rounded-[inherit] object-cover absolute inset-0" aria-hidden="true"></canvas>
  <canvas style="display:none" aria-hidden="true"></canvas>
  <div class="md-v2:px-16 md-v2:py-8 lg-v2:px-32 lg-v2:py-12 relative z-10 mx-auto w-full max-w-960 p-8">
    <div class="rounded-xl-v2 relative flex flex-col items-stretch overflow-hidden">
      <div class="lg-v2:px-20 flex flex-1 flex-col items-center gap-8 px-12 py-16">
        <h2 class="snitch-closing-cta__heading h3-serif-v2 text-center">A treasury for each company.</h2>
        <p class="snitch-closing-cta__description body-1-v2 text-center">Define team access and keep payment records tied to the right account.</p>
        ${primaryLink('Explore Snitch', '/?demo=1')}
      </div>
    </div>
  </div>
</section>`;
