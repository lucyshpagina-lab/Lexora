import pytest

from agents.progress_agent import ProgressAgent
from services.storage import Storage


@pytest.fixture
def storage(tmp_path):
    return Storage(base_dir=str(tmp_path))


@pytest.fixture
def agent(storage):
    return ProgressAgent(storage)


def _seed(storage, user_id="u_1"):
    storage.save(user_id, {
        "user_id": user_id,
        "vocabulary": [],
        "current_index": 0,
        "stats": {"correct": 0, "incorrect": 0, "close": 0},
        "native_language": "English",
        "target_language": "Spanish",
    })


def test_update_stats_correct(agent, storage):
    _seed(storage)
    stats = agent.update_stats("u_1", {"correct": True, "close": False})
    assert stats == {"correct": 1, "incorrect": 0, "close": 0}


def test_update_stats_close(agent, storage):
    _seed(storage)
    stats = agent.update_stats("u_1", {"correct": False, "close": True})
    assert stats == {"correct": 0, "incorrect": 0, "close": 1}


def test_update_stats_incorrect(agent, storage):
    _seed(storage)
    stats = agent.update_stats("u_1", {"correct": False, "close": False})
    assert stats == {"correct": 0, "incorrect": 1, "close": 0}


def test_update_stats_persists(agent, storage):
    _seed(storage)
    agent.update_stats("u_1", {"correct": True})
    agent.update_stats("u_1", {"correct": True})
    state = storage.load("u_1")
    assert state["stats"]["correct"] == 2


def test_update_stats_initialises_when_missing(agent, storage):
    storage.save("u_1", {"user_id": "u_1", "vocabulary": []})
    stats = agent.update_stats("u_1", {"correct": True})
    assert stats == {"correct": 1, "incorrect": 0, "close": 0}
