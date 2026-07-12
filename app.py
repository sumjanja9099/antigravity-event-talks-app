from flask import Flask, jsonify, render_template, request
import requests
import xml.etree.ElementTree as ET
from bs4 import BeautifulSoup
import re
import hashlib
import time
from datetime import datetime

app = Flask(__name__)

# Cache configuration
cache = {
    "data": None,
    "last_fetched": 0
}
CACHE_DURATION_SECONDS = 600  # 10 minutes cache

def parse_release_notes():
    url = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"
    response = requests.get(url, timeout=15)
    response.raise_for_status()
    
    root = ET.fromstring(response.content)
    ns = {'atom': 'http://www.w3.org/2005/Atom'}
    
    updates = []
    
    for entry in root.findall('atom:entry', ns):
        date_str = entry.find('atom:title', ns).text  # e.g. "July 09, 2026"
        updated_str = entry.find('atom:updated', ns).text  # e.g. "2026-07-09T00:00:00-07:00"
        
        # Get alternative link if exists
        link_elem = entry.find("atom:link[@rel='alternate']", ns)
        link = link_elem.attrib.get('href') if link_elem is not None else "https://cloud.google.com/bigquery/docs/release-notes"
        
        content_elem = entry.find('atom:content', ns)
        content_html = content_elem.text if content_elem is not None else ""
        
        soup = BeautifulSoup(content_html, 'html.parser')
        headers = soup.find_all('h3')
        
        if not headers:
            # If no h3 tag exists, treat the entire content as one update
            text_content = soup.get_text(separator=' ').strip()
            text_content = re.sub(r'\s+', ' ', text_content)
            
            # Create stable unique ID
            id_source = f"{date_str}_Info_{text_content[:60]}"
            update_id = hashlib.md5(id_source.encode('utf-8')).hexdigest()
            
            updates.append({
                "id": update_id,
                "date": date_str,
                "raw_date": updated_str,
                "type": "Info",
                "content_html": content_html,
                "content_text": text_content,
                "link": link
            })
        else:
            for idx, header in enumerate(headers):
                update_type = header.get_text().strip()
                
                # Gather siblings until the next h3
                siblings = []
                sibling = header.next_sibling
                while sibling and sibling.name != 'h3':
                    siblings.append(sibling)
                    sibling = sibling.next_sibling
                
                # Reconstruct HTML for this sub-update
                update_soup = BeautifulSoup("", 'html.parser')
                for s in siblings:
                    import copy
                    update_soup.append(copy.copy(s))
                
                update_html = str(update_soup).strip()
                update_text = update_soup.get_text(separator=' ').strip()
                update_text = re.sub(r'\s+', ' ', update_text)
                
                # Create stable unique ID
                id_source = f"{date_str}_{update_type}_{idx}_{update_text[:60]}"
                update_id = hashlib.md5(id_source.encode('utf-8')).hexdigest()
                
                updates.append({
                    "id": update_id,
                    "date": date_str,
                    "raw_date": updated_str,
                    "type": update_type,
                    "content_html": update_html,
                    "content_text": update_text,
                    "link": link
                })
                
    return updates

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/notes')
def get_notes():
    force_refresh = request.args.get('refresh', 'false').lower() == 'true'
    current_time = time.time()
    
    if force_refresh or not cache["data"] or (current_time - cache["last_fetched"] > CACHE_DURATION_SECONDS):
        try:
            updates = parse_release_notes()
            cache["data"] = updates
            cache["last_fetched"] = current_time
            return jsonify({
                "success": True,
                "last_fetched": datetime.fromtimestamp(cache["last_fetched"]).isoformat(),
                "updates": updates
            })
        except Exception as e:
            # If fetch fails but we have cached data, return the cached data with a warning
            if cache["data"]:
                return jsonify({
                    "success": True,
                    "warning": f"Failed to refresh feed, using cached data. Error: {str(e)}",
                    "last_fetched": datetime.fromtimestamp(cache["last_fetched"]).isoformat(),
                    "updates": cache["data"]
                })
            return jsonify({
                "success": False,
                "error": str(e)
            }), 500
    
    return jsonify({
        "success": True,
        "last_fetched": datetime.fromtimestamp(cache["last_fetched"]).isoformat(),
        "updates": cache["data"]
    })

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5001)
