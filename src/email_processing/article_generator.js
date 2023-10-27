async function generateArticle(e) {
	console.log("Generating article.");
	const details = e.bussines_details;

	const business_hyperlink = () => {
		try {
			if (details.website && details.businessName) return `<a href="${details.website}">${details.businessName}</a>`;

			if (details.facebook && details.businessName) return `<a href="${details.facebook}">${details.businessName}</a>`;

			if (details.instagram && details.businessName) return `<a href="${details.instagram}">${details.businessName}</a>`;

			if (details.twitter && details.businessName) return `<a href="${details.twitter}">${details.businessName}</a>`;

			return details.businessName;
		} catch (e) {
			if (details.businessName) return details.businessName;

			return "";
		}
	};

	const number_of_answers = () => {
		try {
			let count = 0;
			for (let i = 0; i < e.QA.length; i++) {
				if (e.QA[i].a.trim() !== "") count++;
			}
			let countWord;
			if (count === 3) countWord = `Three`;
			if (count === 4) countWord = `Four`;
			return { num: count, word: countWord };
		} catch (e) {
			return { num: `__UNKNOWN__`, word: `__UNKNOWN__` };
		}
	};

	const senderTitle = () => {
		try {
			if (details.senderTitle) return details.senderTitle;
			if (!details.senderTitle) return `Founder`;
		} catch (e) {
			return `Founder`;
		}
	};

	const businessOwner = (team) => {
		try {
			if (details.senderName) return details.senderName + ",";
			if (team) return `${details.businessName} team`;
			if (!details.senderName) return "";
		} catch (e) {
			return "";
		}
	};

	const nominations = () => {
		try {
			let numberOfNominations = Object.keys(e.nominations).length;

			if (numberOfNominations == 0) return "";

			let nominationLinks = [];
			for (let i = 0; i < numberOfNominations; i++) {
				if (e.nominations[i].nominated_business_link.includes("http") && e.nominations[i].nominated_business_name)
					nominationLinks.push(
						`<a href="${e.nominations[i].nominated_business_link}" target="_blank">${e.nominations[i].nominated_business_name}</a> in ${e.nominations[i].nominated_business_location}`
					);

				if (!e.nominations[i].nominated_business_link.includes("http") && e.nominations[i].nominated_business_name)
					nominationLinks.push(`${e.nominations[i].nominated_business_name} in ${e.nominations[i].nominated_business_location}`);
			}

			if (numberOfNominations == 1) {
				return `<p>${businessOwner("team").slice(0, -1)} would like to nominate ${nominationLinks[0]} to be featured next!</p>`;
			}

			if (numberOfNominations > 1) {
				let lastNomination = nominationLinks.pop();
				return `<p>${businessOwner("team").slice(0, -1)} would like to nominate ${nominationLinks.join(
					", "
				)}, and ${lastNomination} to be featured next!</p>`;
			}
		} catch (e) {
			return "";
		}
	};

	const location = () => {
		try {
			if (details.address) return `${business_hyperlink()} is located at ${details.address}. `;

			if (!details.address && details.town) return `${business_hyperlink()} is located at ${details.town}. `;

			return "";
		} catch (e) {
			return "";
		}
	};

	const visit_url = () => {
		try {
			if (details.website) return `Visit&nbsp;${business_hyperlink()}&nbsp;online&nbsp;<a href="${details.website}">here</a>.`;
			return "";
		} catch (e) {
			return "";
		}
	};

	const socialMediaLinks = () => {
		try {
			let socialMedia = [
				{ name: "Facebook", link: details.facebook },
				{ name: "Twitter", link: details.twitter },
				{ name: "Instagram", link: details.instagram },
				{ name: "LinkedIn", link: details.linkedin },
			];

			let validLinks = socialMedia.filter((media) => media.link.trim() !== "");

			if (validLinks.length == 0) return "";

			let formattedLinks = [];
			for (let i = 0; i < validLinks.length; i++) {
				formattedLinks.push(`<a href="${validLinks[i].link}" target="_blank">${validLinks[i].name}</a>`);
			}

			if (validLinks.length == 1) {
				return `Make sure to check out their&nbsp;${formattedLinks[0]}&nbsp;page as well!</p>`;
			}

			if (validLinks.length > 1) {
				let lastLink = formattedLinks.pop();
				return `Make sure to check out their&nbsp;${formattedLinks.join(", ")}, and ${lastLink}&nbsp;pages as well!</p>`;
			}
		} catch (e) {
			return "";
		}
	};

	const phoneNumber = () => {
		try {
			if (details.phoneNumber) return `Give ${business_hyperlink()}&nbsp;a call at&nbsp;${details.phoneNumber}</a>.`;
		} catch (e) {
			return "";
		}
	};

	const hashtagTown = () => {
		try {
			if (details.town) {
				let hashtag = details.town.replace(/[\W_]+/g, ""); // remove all non-alphanumeric characters
				hashtag = "#" + hashtag.toLowerCase(); // prepend '#' and make it all lowercase
				return hashtag;
			}
			return "";
		} catch (e) {
			return "";
		}
	};

	const hashtagBusiness = () => {
		try {
			if (details.twitter) {
				let twitterHandle = details.twitter.replace("https://www.twitter.com/", "").replace("https://twitter.com/", "");
				twitterHandle = twitterHandle.replace(/[.,'"]/g, "");
				return `@${twitterHandle}`;
			} else if (details.businessName) {
				let businessName = details.businessName.replace(/[^\w\s]/g, ""); // remove non-alphanumeric characters and non-spaces
				businessName = businessName.replace(/\s+/g, ""); // remove spaces
				return `#${businessName.toLowerCase()}`;
			}
		} catch (e) {
			if (details.businessName) {
				let businessName = details.businessName.replace(/[^\w\s]/g, ""); // remove non-alphanumeric characters and non-spaces
				businessName = businessName.replace(/\s+/g, ""); // remove spaces
				return `#${businessName.toLowerCase()}`;
			}
			return "";
		}
	};

	const hashtagFemaleFounder = () => {
		try {
			if (details.senderGender == "Female") return ` #femalefounder `;

			return "";
		} catch (e) {
			return "";
		}
	};

	let _title = "Why Small Businesses Matter in " + details.town.replace(", CT", "") + ": " + details.businessName;

	let _intro = `<div id="article-content">
<h2>Why Small Businesses Matter</h2>
<p><em>Shop small, do big things for your community</em></p>
<p>Why Small Businesses Matter puts a spotlight on the local merchants who donate their time, talent, goods, and services for the betterment of our community. The shop local movement spreads virally as local businesses who are “tagged” have the opportunity to share their story!</p>
<p><strong>You're IT&nbsp;${business_hyperlink()}!</strong></p>
<p>${number_of_answers().word} questions with&nbsp;${businessOwner()} ${senderTitle()} of&nbsp;${business_hyperlink()}.</p>`;

	let _answers = () => {
		let questionsAndAnswers = "";
		for (let i = 0; i < e.QA.length; i++) {
			if (e.QA[i].a.trim() !== "")
				questionsAndAnswers += `<p><strong>${e.QA[i].q}</strong></p>
        <p>${e.QA[i].a}</p>`;
		}
		return questionsAndAnswers;
	};

	let _conclusion = `${nominations()}
  <p>${location()}${visit_url()} ${socialMediaLinks()} ${phoneNumber()}</p>
  <p><strong>HamletHub thanks <a href="https://www.fairfieldcountybank.com/">Fairfield County Bank&nbsp;</a>for making our Why Small Businesses Matter series possible!</strong></p> </div>`;

	let _meta_description = `#whysmallbusinessesmatter in ${hashtagTown()} made possible by #FairfieldCountyBank ${
		number_of_answers().num
	} questions with ${hashtagBusiness()} ${JSON.stringify(e.QA_keywords)} ${hashtagFemaleFounder()}#shoplocal #smallbusiness`;

	let completeArticle = _title + "\n\n" + _intro + "\n\n" + _answers() + "\n\n" + _conclusion + "\n\n" + _meta_description;

	return completeArticle.replace("undefined", "");
}

export default generateArticle;
