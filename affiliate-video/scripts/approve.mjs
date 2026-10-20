// npm run approve -- <videoId>                       -> approved (ready to post)
// npm run approve -- <videoId> --reject "reason"     -> rejected (reason kept for the writer's next round)
// npm run approve -- <videoId> --published <url>     -> published (links performance rows to this video)
import { arg, log } from "./lib.mjs";
import { buildReview, loadVideos, setVideo } from "./registry.mjs";

const id = process.argv[2];
const v = loadVideos()[id];
if (!v) throw new Error(`unknown video ${id}`);
const reject = arg("reject");
const published = arg("published");
if (reject) setVideo({ id, status: "rejected", rejectReason: reject });
else if (published) setVideo({ id, status: "published", publishedUrl: published, publishedAt: new Date().toISOString() });
else {
  if (v.status !== "review") throw new Error(`${id} is ${v.status}; only videos in review can be approved`);
  setVideo({ id, status: "approved", approvedAt: new Date().toISOString() });
}
buildReview();
log(`${id}: ${loadVideos()[id].status}`);
