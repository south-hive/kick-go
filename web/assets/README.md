# 비행 배경

`pywel-panorama.png`는 이 게임을 위해 built-in `image_gen` 도구로 생성한 2D 일러스트입니다. 공식 게임에서 추출한 이미지가 아닙니다. 원본 생성 파일을 프로젝트 안으로 복사했으며 게임 선택 카드와 비행 배경에서 함께 사용합니다. 캐릭터·수집물·유적·근경 지형은 Canvas 코드로 그립니다.

사용 프롬프트:

> Use case: stylized-concept. Asset type: panoramic background illustration for a playable 2D side-scrolling browser distance-flight game inspired by Crimson Desert. Create a 3072x1024 landscape image, no text, no logos, no UI, no characters. Painterly 2D fantasy game art with clear layered shapes, atmospheric depth, elegant restrained detail. A sweeping view across Pywel: ancient stone fortress and emerald wooded hills on the left, distant snow-covered jagged mountains in the center, sunlit rust-red sandstone mesas and dry desert on the right. A few mystical floating stone ruins with subtle turquoise Abyss energy hover in the broad open sky. Warm late-afternoon amber sun with pale teal sky and layered clouds. Top two thirds are spacious traversable sky; bottom third is the layered landscape. Horizon roughly at 65% height. The left and right ends fade naturally into atmospheric sky/haze so it can serve as a parallax illustration. Original illustration, not a screenshot or copy of official artwork. This is game background art, not a mockup. Save a project-usable image file and report its local path.

실제 생성 크기는 2172 × 724입니다. 게임은 이미지 비율에 맞춰 배치하고, 이미지가 로드되지 않아도 지형·캐릭터·조작을 그립니다.
