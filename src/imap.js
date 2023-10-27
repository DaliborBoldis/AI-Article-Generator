// Importing the necessary modules
import Imap from "imap";
import { simpleParser } from "mailparser";
import { config } from "dotenv";
config();

// Establishing the IMAP connection using Imap() with the mail server details
let imap = new Imap({
	user: process.env.imap_user,
	password: process.env.imap_password,
	host: "box.hamletmail.com",
	port: 993,
	tls: true,
});

// Defining the fetchEmails function, which is asynchronous
async function fetchEmails() {
	// A Promise is returned that will resolve when the emails are fetched, or reject if an error occurs
	return new Promise((resolve, reject) => {
		// Defining function to open the Inbox
		function openInbox(cb) {
			try {
				imap.openBox("INBOX", false, cb);
			} catch (err) {
				reject(new Error(`fetchEmails: ${err.message}`)); // Rejecting the Promise if an error occurs
			}
		}

		let emails = []; // Array to hold the fetched email objects

		// Listener for when IMAP connection is ready to start fetching emails
		imap.once("ready", function () {
			try {
				openInbox(function (err) {
					if (err) throw err;
					let f = imap.seq.fetch("1:*", {
						bodies: "",
						struct: true,
						uid: true,
					});

					// Listener for when an individual message is ready to be processed
					f.on("message", function (msg) {
						let email = {};
						let body = "";

						// Listener to read the data stream of the email body
						msg.on("body", function (stream) {
							stream.on("data", function (chunk) {
								body += chunk.toString("utf8");
							});
						});

						// Capture the uid in the attributes event
						msg.once("attributes", function (attrs) {
							email.uid = attrs.uid;
						});

						msg.once("end", function () {
							// Parses the raw email body
							simpleParser(body, async (err, mail) => {
								if (err) throw err;

								const emailHeaders = extractEmailHeaders(mail.text);

								// Populating email details
								if (mail.subject) email.Subject = mail.subject;
								if (mail.headers.get("message-id")) email.MessageID = mail.headers.get("message-id");
								if (mail.text) email.Body = mail.text;
								let attachments = [];

								if (mail.attachments) {
									attachments = mail.attachments.map((attachment) => {
										return {
											filename: attachment.filename,
											contentType: attachment.contentType,
											length: attachment.length,
											content: attachment.content,
										};
									});
								}

								// Adding parsed email to emails array
								emails.push({
									id: email.MessageID,
									html: mail.html,
									email: await cleanEmailString(JSON.stringify(email)),
									emailHeaders,
									attachments: attachments,
									uid: email.uid,
								});
							});
						});
					});

					f.once("error", function (err) {
						reject(new Error(err.message)); // Rejecting the Promise if an error occurs
					});

					f.once("end", function () {
						console.log("Done fetching all messages!");
						imap.end();
					});
				});
			} catch (err) {
				reject(new Error(err.message)); // Rejecting the Promise if an error occurs
			}
		});

		// Listener for errors in IMAP connection
		imap.once("error", function (err) {
			console.log(err);
			reject(new Error(err.message)); // Rejecting the Promise if an error occurs
		});

		// Listener for when the IMAP connection ends
		imap.once("end", function () {
			console.log("Connection ended");

			resolve(emails); // Resolving the Promise with the emails array
		});

		imap.connect(); // Initiating the IMAP connection
	});
}

/**
 * Archives an email from the inbox.
 *
 * @param {string} uid - The unique identifier for the email to be archived.
 *
 * @throws {Error} Throws an error if the archiving process fails.
 *
 * @returns {Promise} Returns a promise that resolves when the email is successfully archived.
 */
async function ArchiveEmail(uid) {
	console.log("Archiving email: " + uid);
	try {
		await new Promise((resolve, reject) => {
			imap.once("ready", function () {
				imap.openBox("INBOX", false, function (err) {
					if (err) {
						reject(err);
					} else {
						imap.move(uid, "Archive", (err) => {
							if (err) {
								console.log("Failed to archive email:", err);
								reject(err);
							} else {
								console.log("Email archived: " + uid);
								resolve();
							}
							imap.end(); // Closing the IMAP connection after moving the email
						});
					}
				});
			});
			imap.connect(); // Initiating the IMAP connection
		});
	} catch (error) {
		console.error(error);
		reject(error);
	}
}

/**
 * Cleans an email string by removing unwanted substrings and common strings.
 *
 * @async
 * @param {string} email_string - The email string to be cleaned.
 *
 * @returns {string} The cleaned email string.
 */
async function cleanEmailString(email_string) {
	let email = email_string;

	// List of strings to look for
	let unwantedStrings = ["hamlethub", "maps.google.com", "zohoinsights", "fairfieldcapital", "image"];

	// Replace all substrings between < and > or [ and ] that contain any of the unwanted strings
	email = email.replace(/<[^>]*>|\[[^\]]*\]/g, function (match) {
		// Convert match to lowercase for comparison
		let lowerMatch = match.toLowerCase();

		// Check if any unwanted string is contained in the match
		for (let str of unwantedStrings) {
			if (lowerMatch.includes(str)) {
				// If so, replace the match with an empty string
				return "";
			}
		}

		// If no unwanted string is contained, keep the original match
		return match;
	});

	// List of common strings to remove
	let commonStrings = [
		"*Dan Boldis Vice President – Community Building*",
		"HAMLETHUB Your Town. Your Story. Our Mission.",
		"Winner Press Club Award 2012-2017",
		"37 Danbury Road | Ridgefield,  CT  06877",
		"Tel 203-431-6400 x7125",
		"-- \nDalibor Boldis",
		"*Vice President – Community Building*",
		"Subscribe here",
		"website | newsletter | map",
		"| email",
		"HAMLETHUB Your",
		"Town. Your Story. Our Mission.",
	];

	// Remove each common string from the larger string
	for (let str of commonStrings) {
		let regex = new RegExp(str.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&"), "g");
		email = email.replace(regex, "");
	}

	// Remove lines that start with '>'
	email = email.replace(/^>.*[\r\n]/gm, "");

	// Remove empty lines or lines with only whitespace
	email = email.replace(/^\s*[\r\n]/gm, "");

	email = email.replace(/(\\n)+/g, "\n");

	return email;
}

/**
 * Extracts specific headers (From, To, Date, Subject) from an email.
 *
 * @param {string} input - The raw email string from which headers are to be extracted.
 *
 * @returns {Object} An object containing 'from', 'to', 'date', and 'subject' properties extracted from the email.
 */
function extractEmailHeaders(input) {
	const fromRegex = /From: (.*?)\n/;
	const toRegex = /To: (.*?)\n/;
	const dateRegex = /Date: (.*?)\n/;
	const subjectRegex = /Subject: (.*?)\n/;

	const from = input.match(fromRegex) ? input.match(fromRegex)[1] : null;
	const to = input.match(toRegex) ? input.match(toRegex)[1] : null;
	const date = input.match(dateRegex) ? input.match(dateRegex)[1] : null;
	const subject = input.match(subjectRegex) ? input.match(subjectRegex)[1] : null;

	return { from, to, date, subject };
}

export { fetchEmails, ArchiveEmail };
