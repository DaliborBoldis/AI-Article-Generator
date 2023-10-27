import axios from "axios";
import cheerio from "cheerio";
import { OpenAI } from "langchain/llms/openai";
import { DynamicTool } from "langchain/tools";
import { WebBrowser } from "langchain/tools/webbrowser";
import { ReadFileTool, WriteFileTool } from "langchain/tools";

const store = new InMemoryFileStore();

/**
 * Object containing the tools used to perform various operations such as
 * making Google searches, parsing social media links from a URL, and interacting with the WebBrowser tool.
 */
const toolsObject = {
	google_search: new DynamicTool({
		name: "google_search",
		description: "call this to get top 5 search results for your query. input should be search query",
		func: async (query) => {
			console.log("LLM searched google for: " + query);
			const apiKey = process.env.googleApiKey;
			const cseId = process.env.googlecseID;
			try {
				const response = await axios.get("https://www.googleapis.com/customsearch/v1", {
					params: {
						key: apiKey,
						cx: cseId,
						q: query,
						num: 5, // Number of search results
					},
				});

				return JSON.stringify(
					response.data.items.map((item) => ({
						title: item.title,
						link: item.link,
						snippet: item.snippet,
					}))
				);
			} catch (error) {
				JSON.stringify(`Error occurred while fetching search results: ${error.message}`);
			}
		},
	}),
	link_parser: new DynamicTool({
		name: "link_parser",
		description:
			"Call this to get an array of social media links from any URL. Input should be url in format: https://exampleurl.com/",
		func: async (url) => {
			console.log("LLM asked to parse links from: " + url);
			const substrings = ["facebook.com", "instagram.com", "twitter.com"];
			try {
				const response = await axios.get(url);
				const html = response.data;

				const $ = cheerio.load(html);
				const links = [];

				$("a").each(async (i, link) => {
					const href = $(link).attr("href");
					if (href && href.startsWith("http")) {
						for (let substring of substrings) {
							if (href.includes(substring)) {
								links.push(href);
								break; // Break after the first match
							}
						}
					}
				});

				return JSON.stringify(links);
			} catch (error) {
				return JSON.stringify(`Error occurred while fetching data from ${url}: ${error.message}`);
			}
		},
	}),
	web_browser: new WebBrowser({ model: new OpenAI({ openAIApiKey: process.env.openaiApiKey }) }),

	
};

/**
 * Function to get a tool from the toolsObject by name.
 * @param {string} toolName - The name of the tool to retrieve.
 * @returns {DynamicTool|WebBrowser} The requested tool.
 */
function getTool(toolName) {
	return toolsObject[toolName];
}

export default getTool;
