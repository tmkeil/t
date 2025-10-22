// 
type Route = { template: string; auth?: boolean; };

// Map routes to HTML files
const routes: Record<string, Route> = {
    "/": { template: "/pages/Home.html", auth: true },
    "/login": { template: "/pages/Login.html", auth: false },
    "/profile": { template: "/pages/Profile.html", auth: true },
    "/dashboard": { template: "/pages/Dashboard.html", auth: true },
    "/local": { template: "/pages/Local.html", auth: true },
    "/remote": { template: "/pages/Remote.html", auth: true },
    "/ai": { template: "/pages/AI.html", auth: true },
    "/tournament": { template: "/pages/Tournament.html", auth: true },
    "/404": { template: "/pages/404.html", auth: false },
};

// Teardown function. When navigating away from a page, the returned code from the site controller is called
let teardown: () => void = () => {};

// If the user is authenticated (has a userId in localStorage)
const isAuthed = async () => {
  console.log("Checking authentication status...");
  const res = await fetch(`https://${location.host}/api/me`, {
    method: "GET",
    credentials: "include",
  });
  console.log("Authentication status response:", res);
  return res.ok;
};

// This updates the browser's history and loads the new page content.
export function navigate(path: string): void {
    console.log(`Navigating to ${path}`);
    // When navigating away, call the previous page's teardown function
    teardown();
    // Reset the teardown function to a no-op
    teardown = () => {};
    history.pushState({}, "", path);
    handleLocation();
}

// After adding the data-link via navigate, the window.history.pathname is the new URL and
// the main-page div will be updated with the new content.
async function handleLocation(): Promise<void> {
    console.log("Handling location:", location.pathname);
    let path = location.pathname;
    let route = routes[path] || routes["/404"];

    // Remove the navigation bar from the login/register pages
    const noNav = ["/login", "/register"];
    const nav = document.querySelector("nav") as HTMLElement;
    nav.style.display = noNav.includes(path) ? "none" : "block";

    // Route protection/guard. Redirect to login if not authenticated
    if (route.auth && !(await isAuthed())) {
        console.log("User not authenticated, redirecting to /login");
        history.replaceState({}, "", "/login");
        path = "/login";
        route = routes["/login"];
    }

    try {
        // Fetch the HTML template for the route
        const html = await fetch(route.template).then(r => r.text());
        // Inject the HTML into the main page container
        const root = document.getElementById("main-page")!;
        root.innerHTML = html;
        if (path === "/") {
            console.log("Loading home page");
            const { HomeController } = await import("/src/pages/Home.js");
            // Call the HomeController to set up event listeners and manage the home page
            // Teardown function when navigating away from the home page, the return code from HomeController is called
            teardown = await HomeController(root);
        } else if (path === "/login") {
            console.log("Loading login page");
            const { mountLogin } = await import("/src/pages/Login.js");
            // Call the mountLogin to set up event listeners and manage the login page
            // And execute the returned code, when navigating away from the login page
            mountLogin(root);
            teardown = () => {};
        } else if (path === "/dashboard") {
            const { mountDashboard } = await import("/src/pages/Dashboard.js");
            teardown = await mountDashboard(root);
        } else if (path === "/tournament") {
            console.log("Loading tournament page");
            const { TournamentController } = await import("/src/pages/Tournament.js");
            teardown = await TournamentController(root);
        } else if (path === "/local") {
            console.log("Loading local-play page");
            const { LocalController } = await import("/src/pages/Local.js");
            teardown = await LocalController(root);
        } else if (path === "/remote") {
            console.log("Loading remote-play page");
            const { RemoteController } = await import("/src/pages/Remote.js");
            teardown = await RemoteController(root);
        } else if (path === "/ai") {
            console.log("Loading ai-play page");
            const { AIController } = await import("/src/pages/AI.js");
            teardown = await AIController(root);
        }
    } catch (e) {
        console.error(e);
    }
};

// Catch every click on data-link elements and retrieve the href from the <a> tag
document.addEventListener("click", (e) => {
    const a = (e.target as HTMLElement).closest('a[data-link]') as HTMLAnchorElement | null;
    if (!a)
        return;
    const href = a.getAttribute("href");
    if (!href)
        return;
    e.preventDefault();
    navigate(href);
});

// When navigating with the browser's back/forward buttons, the history state will be updated
window.addEventListener("popstate", handleLocation);
// When the DOM is fully loaded, handle the initial location which is "/" poiting on the home page
document.addEventListener("DOMContentLoaded", handleLocation);
